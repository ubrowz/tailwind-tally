import Foundation
import WebKit

/// Owns the WKWebView's navigation state and the one piece of native
/// glue this app adds: taking a .gpx file the OS hands to us (Share
/// Sheet, Files, AirDrop) and feeding it into the already-loaded page.
///
/// The page already exposes `loadGpxText(text, label)` - built for the
/// Strava-import path to share code with the file drop-zone - so this
/// hand-off needs no changes on the web side at all.
final class WebViewCoordinator: NSObject, ObservableObject, WKNavigationDelegate {
    @Published var isLoading = true
    @Published var loadError: String?

    private weak var webView: WKWebView?
    private var pendingFile: (text: String, label: String)?

    func attach(_ webView: WKWebView) {
        self.webView = webView
    }

    func reload(url: URL) {
        loadError = nil
        isLoading = true
        webView?.load(URLRequest(url: url))
    }

    func handleIncomingFile(at url: URL) {
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
