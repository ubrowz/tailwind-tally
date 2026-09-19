import AuthenticationServices
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
/// 2. Restricting navigation to known hosts, and routing Strava's login
///    through ASWebAuthenticationSession (a system browser sheet with a
///    real address bar and Safari's cookies) instead of letting it load
///    inside this app's own chrome-less web view, where a user would
///    have no way to verify they're actually on strava.com before
///    entering their password. See the security review this came out
///    of: the previous version just let the page's own
///    `window.location.href = <strava authorize URL>` navigate this
///    same WKWebView, same as any other link.
final class WebViewCoordinator: NSObject, ObservableObject, WKNavigationDelegate {
    @Published var isLoading = true
    @Published var loadError: String?

    private weak var webView: WKWebView?
    private var pendingFile: (text: String, label: String)?
    private var authSession: ASWebAuthenticationSession?

    // The only host this app ever needs to show inside its own web
    // view. Strava is handled separately, below, via
    // ASWebAuthenticationSession rather than by navigating here at all;
    // anything else (map tile-provider attribution links, etc.) is
    // handed off to the system browser instead of loading untrusted
    // content in a view with no address bar.
    private let allowedHost = "ubrowz.github.io"
    private let stravaHost = "www.strava.com"
    private let callbackPath = "/tailwind-tally/"

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

    // MARK: - Strava sign-in

    /// Launches the system auth-session browser for Strava's login,
    /// instead of letting it load in our own web view. Strava's whole
    /// login/consent flow (any 2FA, "choose account", etc.) happens
    /// inside that system-managed sheet; this only ever gets called
    /// back once, with the final redirect to our own https callback
    /// URL - which we then load into the web view exactly as if the
    /// page had been redirected there normally, so the page's own
    /// existing `handleStravaRedirect()` JS picks it up unchanged.
    private func startStravaSignIn(authorizeURL: URL) {
        let session = ASWebAuthenticationSession(
            url: authorizeURL,
            callback: .https(host: allowedHost, path: callbackPath)
        ) { [weak self] callbackURL, error in
            // The session's completion handler isn't documented as
            // guaranteed-main-thread, and this drives @Published state
            // plus a WKWebView load - both need the main thread.
            DispatchQueue.main.async {
                guard let self, let webView = self.webView else { return }
                let authError = error as? ASWebAuthenticationSessionError
                if let callbackURL {
                    webView.load(URLRequest(url: callbackURL))
                } else if authError?.code == .canceledLogin {
                    // The user actually declined - land back on the
                    // plain page with ?error= set, same as a real
                    // Strava cancel would produce, so the page's
                    // existing error handling (not custom code here)
                    // takes it from there.
                    var components = URLComponents()
                    components.scheme = "https"
                    components.host = self.allowedHost
                    components.path = self.callbackPath
                    components.queryItems = [URLQueryItem(name: "error", value: "access_denied")]
                    if let url = components.url {
                        webView.load(URLRequest(url: url))
                    }
                } else {
                    // Something else went wrong before the user ever
                    // saw a login page (e.g. no valid window to present
                    // on) - surface the real reason instead of a
                    // generic "cancelled" that hides what happened.
                    self.loadError = "Couldn't open Strava sign-in: "
                        + (error?.localizedDescription ?? "unknown error")
                }
                self.authSession = nil
            }
        }
        session.presentationContextProvider = self
        session.prefersEphemeralWebBrowserSession = false
        authSession = session
        if !session.start() {
            loadError = "Couldn't open Strava sign-in (no window to present it on)."
            authSession = nil
        }
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
        if host == stravaHost {
            decisionHandler(.cancel)
            startStravaSignIn(authorizeURL: url)
            return
        }
        if host == allowedHost {
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

// MARK: - ASWebAuthenticationPresentationContextProviding

extension WebViewCoordinator: ASWebAuthenticationPresentationContextProviding {
    func presentationAnchor(for session: ASWebAuthenticationSession) -> ASPresentationAnchor {
        // Filtering scenes by activationState == .foregroundActive here
        // was too strict - it could miss the app's own scene depending
        // on exactly when the system queries this, silently falling
        // back to a blank, unattached window that nothing can actually
        // present on (looked like an instant "cancelled" login with no
        // UI ever shown). UIWindowScene.keyWindow is the standard,
        // reliable way to get a presentable anchor for a single-window
        // app like this one.
        let windowScenes = UIApplication.shared.connectedScenes.compactMap { $0 as? UIWindowScene }
        if let keyWindow = windowScenes.compactMap({ $0.keyWindow }).first {
            return keyWindow
        }
        return windowScenes.first?.windows.first ?? ASPresentationAnchor()
    }
}
