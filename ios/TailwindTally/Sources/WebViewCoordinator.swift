import Foundation
import UIKit
import WebKit

/// Owns the WKWebView's navigation state and two pieces of native glue:
///
/// 1. Taking a .gpx file the OS hands to us (Share Sheet, Files,
///    AirDrop) and feeding it into the already-loaded page via the
///    page's own `loadGpxText(text, label)` - built for the
///    Strava-import path to share code with the file drop-zone, so
///    this hand-off needs no changes on the web side at all.
/// 2. Restricting navigation to known hosts, so a compromised
///    dependency, an ad, or an open redirect can't take over this
///    chrome-less web view to show arbitrary content with no address
///    bar for the user to check.
///
/// This originally also routed Strava's login through
/// ASWebAuthenticationSession instead of this web view, for the same
/// no-address-bar reason - Strava's OAuth page would otherwise be
/// indistinguishable from a phishing page. That needs the newer
/// ASWebAuthenticationSession.Callback.https(host:path:) API, which in
/// testing failed immediately (ASWebAuthenticationSessionError
/// .canceledLogin, no UI ever shown) - the leading explanation is that
/// this callback type expects an Associated Domains / apple-app-site-
/// association setup at the root of ubrowz.github.io, which isn't
/// available (that's a separate GitHub Pages site from this project's
/// repo). Reverted to letting Strava load directly in this web view -
/// an accepted, deliberate tradeoff (no in-app address bar during
/// Strava login specifically), not an oversight - while keeping the
/// general navigation allowlist for everything else.
final class WebViewCoordinator: NSObject, ObservableObject, WKNavigationDelegate {
    @Published var isLoading = true
    @Published var loadError: String?

    private weak var webView: WKWebView?
    private var pendingFile: (text: String, label: String)?

    // Hosts allowed to navigate inside this app's own web view. Strava
    // is included deliberately (see the type doc above); anything else
    // (map tile-provider attribution links, etc.) is handed off to the
    // system browser instead of loading untrusted content in a view
    // with no address bar.
    private let allowedHost = "ubrowz.github.io"
    private let stravaHost = "www.strava.com"

    // Plain-text GPX files are small; this is a generous ceiling against
    // a maliciously (or just accidentally) huge shared file being read
    // fully into memory before it's even been looked at.
    private let maxIncomingFileBytes = 20 * 1024 * 1024

    func attach(_ webView: WKWebView) {
        self.webView = webView
    }

    func reload(url: URL) {
        loadError = nil
        isLoading = true
        webView?.load(URLRequest(url: url))
    }

    func handleIncomingFile(at url: URL) {
        let attributes = try? FileManager.default.attributesOfItem(atPath: url.path)
        if let size = attributes?[.size] as? Int, size > maxIncomingFileBytes {
            loadError = "That GPX file is too large to open (over 20 MB)."
            return
        }
        guard let text = try? String(contentsOf: url, encoding: .utf8) else {
            loadError = "Couldn't read that GPX file."
            return
        }
        pendingFile = (text: text, label: url.lastPathComponent)
        if isLoading == false {
            flushPendingFile()
        }
        // else: didFinish will flush it once the page is ready.
    }

    private func flushPendingFile() {
        guard let file = pendingFile,
              let webView,
              let textJSON = try? JSONEncoder().encode(file.text),
              let labelJSON = try? JSONEncoder().encode(file.label),
              let textJS = String(data: textJSON, encoding: .utf8),
              let labelJS = String(data: labelJSON, encoding: .utf8)
        else { return }
        pendingFile = nil
        webView.evaluateJavaScript("loadGpxText(\(textJS), \(labelJS));")
    }

    // MARK: - WKNavigationDelegate

    func webView(
        _ webView: WKWebView,
        decidePolicyFor navigationAction: WKNavigationAction,
        decisionHandler: @escaping (WKNavigationActionPolicy) -> Void
    ) {
        guard let url = navigationAction.request.url, let host = url.host else {
            decisionHandler(.cancel)
            return
        }
        if host == allowedHost || host == stravaHost {
            decisionHandler(.allow)
            return
        }
        // Anything else (OpenStreetMap/MapTiler/Leaflet attribution
        // links, etc.) - hand off to the system browser rather than
        // either loading unexpected content in this app's chrome-less
        // view, or silently doing nothing on tap.
        decisionHandler(.cancel)
        UIApplication.shared.open(url)
    }

    func webView(_ webView: WKWebView, didStartProvisionalNavigation navigation: WKNavigation!) {
        isLoading = true
        loadError = nil
    }

    func webView(_ webView: WKWebView, didFinish navigation: WKNavigation!) {
        isLoading = false
        flushPendingFile()
    }

    func webView(_ webView: WKWebView, didFail navigation: WKNavigation!, withError error: Error) {
        isLoading = false
        loadError = error.localizedDescription
    }

    func webView(_ webView: WKWebView, didFailProvisionalNavigation navigation: WKNavigation!, withError error: Error) {
        isLoading = false
        loadError = error.localizedDescription
    }
}
