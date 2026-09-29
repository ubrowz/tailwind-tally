import CoreLocation
import Foundation
import WebKit

/// Gives the page's Live tab the device location through the app instead of through
/// WebKit. With WebKit's own geolocation, iOS asks twice (once for the app, then again
/// for the website) and offers the precise location by default. Here the page's
/// `navigator.geolocation.getCurrentPosition` is answered natively: one iOS prompt,
/// approximate accuracy by default (`NSLocationDefaultAccuracyReduced` in Info.plist,
/// `kCLLocationAccuracyReduced` here). The page rounds the position to about 11 km
/// before it sends anything anywhere.
///
/// Only the app's own site gets an answer: the script is inert on any other host, and a
/// message from any other origin is ignored.
final class LocationBridge: NSObject, WKScriptMessageHandler, CLLocationManagerDelegate {
    static let handlerName = "ttLocation"

    private let allowedHost: String
    private weak var webView: WKWebView?
    private let manager = CLLocationManager()
    private var waiting: [Int] = []

    init(allowedHost: String) {
        self.allowedHost = allowedHost
        super.init()
        manager.delegate = self
        manager.desiredAccuracy = kCLLocationAccuracyReduced
    }

    func attach(_ webView: WKWebView) {
        self.webView = webView
    }

    /// Installed at document start: replaces getCurrentPosition on the app's own site only.
    var userScript: WKUserScript {
        let js = """
        (function () {
          if (location.hostname !== "\(allowedHost)") return;
          var h = window.webkit && window.webkit.messageHandlers && window.webkit.messageHandlers.\(Self.handlerName);
          if (!h || !navigator.geolocation) return;
          var pending = {}, next = 1;
          window.__ttLocationReply = function (id, ok, a, b, c) {
            var cb = pending[id]; if (!cb) return; delete pending[id]; clearTimeout(cb.timer);
            if (ok) cb.success({ coords: { latitude: a, longitude: b, accuracy: c, altitude: null, altitudeAccuracy: null, heading: null, speed: null }, timestamp: Date.now() });
            else if (cb.error) cb.error({ code: a, message: b, PERMISSION_DENIED: 1, POSITION_UNAVAILABLE: 2, TIMEOUT: 3 });
          };
          navigator.geolocation.getCurrentPosition = function (success, error) {
            var id = next++;
            pending[id] = { success: success, error: error, timer: setTimeout(function () { window.__ttLocationReply(id, false, 3, "Timeout"); }, 30000) };
            h.postMessage({ id: id });
          };
        })();
        """
        return WKUserScript(source: js, injectionTime: .atDocumentStart, forMainFrameOnly: true)
    }

    // MARK: WKScriptMessageHandler

    func userContentController(_ userContentController: WKUserContentController, didReceive message: WKScriptMessage) {
        guard message.frameInfo.securityOrigin.host == allowedHost,
              let body = message.body as? [String: Any],
              let id = body["id"] as? Int else { return }
        waiting.append(id)
        switch manager.authorizationStatus {
        case .notDetermined:
            manager.requestWhenInUseAuthorization()   // answered in locationManagerDidChangeAuthorization
        case .denied, .restricted:
            failAll(code: 1, message: "Location permission denied")
        default:
            manager.requestLocation()
        }
    }

    // MARK: CLLocationManagerDelegate

    func locationManagerDidChangeAuthorization(_ manager: CLLocationManager) {
        guard !waiting.isEmpty else { return }
        switch manager.authorizationStatus {
        case .authorizedWhenInUse, .authorizedAlways:
            manager.requestLocation()
        case .denied, .restricted:
            failAll(code: 1, message: "Location permission denied")
        default:
            break   // still undecided: the prompt is showing
        }
    }

    func locationManager(_ manager: CLLocationManager, didUpdateLocations locations: [CLLocation]) {
        guard let loc = locations.last else { return }
        let c = loc.coordinate
        reply(ok: true, args: [String(c.latitude), String(c.longitude), String(loc.horizontalAccuracy)])
    }

    func locationManager(_ manager: CLLocationManager, didFailWithError error: Error) {
        let denied = (error as? CLError)?.code == .denied
        failAll(code: denied ? 1 : 2, message: denied ? "Location permission denied" : "Location unavailable")
    }

    // MARK: Replies to the page

    private func failAll(code: Int, message: String) {
        reply(ok: false, args: [String(code), "\"\(message)\""])
    }

    private func reply(ok: Bool, args: [String]) {
        let ids = waiting
        waiting.removeAll()
        for id in ids {
            let js = "window.__ttLocationReply && window.__ttLocationReply(\(id), \(ok), \(args.joined(separator: ", ")))"
            webView?.evaluateJavaScript(js, completionHandler: nil)
        }
    }
}

/// WKUserContentController keeps a strong reference to its message handlers; this
/// forwards to the bridge without keeping it (or the coordinator) alive.
final class WeakScriptMessageHandler: NSObject, WKScriptMessageHandler {
    private weak var target: WKScriptMessageHandler?
    init(_ target: WKScriptMessageHandler) { self.target = target }
    func userContentController(_ userContentController: WKUserContentController, didReceive message: WKScriptMessage) {
        target?.userContentController(userContentController, didReceive: message)
    }
}
