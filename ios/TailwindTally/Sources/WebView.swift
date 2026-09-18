import SwiftUI
import WebKit

/// SwiftUI wrapper around a single WKWebView. All the state (loading,
/// errors, the pending-GPX hand-off) lives on the shared coordinator so
/// SwiftUI's view-recreation doesn't lose track of it.
struct WebView: UIViewRepresentable {
    let url: URL
    let coordinator: WebViewCoordinator

    func makeUIView(context: Context) -> WKWebView {
        let configuration = WKWebViewConfiguration()
        // The page runs entirely client-side except for its own backend
        // calls (tile proxy, Strava import) - nothing here needs extra
        // WKWebView configuration beyond the defaults.
        let webView = WKWebView(frame: .zero, configuration: configuration)
        webView.navigationDelegate = coordinator
        webView.allowsBackForwardNavigationGestures = true
        coordinator.attach(webView)
        webView.load(URLRequest(url: url))
        return webView
    }

    func updateUIView(_ uiView: WKWebView, context: Context) {}
}
