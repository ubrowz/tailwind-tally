import Foundation
import Photos
import WebKit

/// Lets the page's "Save image" buttons put the image straight into the Photos library.
/// A web page can only hand an image to iOS as a *file* (share sheet: Files, but no
/// "Save Image", and WhatsApp refuses it); here the app saves it as a real photo.
///
/// The page calls `window.__ttSaveImage(name, base64Png)`, which this script defines (the
/// page also uses its presence to know the app can do this - keep the name). The app asks
/// for add-only access the first time (NSPhotoLibraryAddUsageDescription): it can add
/// photos, never see the library. Only the app's own site gets an answer.
final class PhotoSaver: NSObject, WKScriptMessageHandler {
    static let handlerName = "ttSaveImage"

    private let allowedHost: String
    private weak var webView: WKWebView?

    init(allowedHost: String) {
        self.allowedHost = allowedHost
        super.init()
    }

    func attach(_ webView: WKWebView) {
        self.webView = webView
    }

    var userScript: WKUserScript {
        let js = """
        (function () {
          if (location.hostname !== "\(allowedHost)") return;
          var h = window.webkit && window.webkit.messageHandlers && window.webkit.messageHandlers.\(Self.handlerName);
          if (!h) return;
          var pending = {}, next = 1;
          window.__ttSaveImageReply = function (id, result) {
            var cb = pending[id]; if (!cb) return; delete pending[id]; cb(result);
          };
          // -> Promise of "saved", "denied" or "error"
          window.__ttSaveImage = function (name, base64) {
            return new Promise(function (resolve) {
              var id = next++;
              pending[id] = resolve;
              h.postMessage({ id: id, name: String(name || "Tailwind Tally.png"), data: String(base64 || "") });
            });
          };
        })();
        """
        return WKUserScript(source: js, injectionTime: .atDocumentStart, forMainFrameOnly: true)
    }

    func userContentController(_ userContentController: WKUserContentController, didReceive message: WKScriptMessage) {
        guard message.frameInfo.securityOrigin.host == allowedHost,
              let body = message.body as? [String: Any],
              let id = body["id"] as? Int else { return }
        guard let base64 = body["data"] as? String, let data = Data(base64Encoded: base64), !data.isEmpty else {
            reply(id, "error")
            return
        }
        let name = (body["name"] as? String) ?? "Tailwind Tally.png"
        PHPhotoLibrary.requestAuthorization(for: .addOnly) { status in
            guard status == .authorized || status == .limited else {
                self.reply(id, "denied")
                return
            }
            PHPhotoLibrary.shared().performChanges({
                let options = PHAssetResourceCreationOptions()
                options.originalFilename = name
                PHAssetCreationRequest.forAsset().addResource(with: .photo, data: data, options: options)
            }, completionHandler: { ok, _ in
                self.reply(id, ok ? "saved" : "error")
            })
        }
    }

    private func reply(_ id: Int, _ result: String) {
        DispatchQueue.main.async {
            self.webView?.evaluateJavaScript("window.__ttSaveImageReply && window.__ttSaveImageReply(\(id), \"\(result)\")", completionHandler: nil)
        }
    }
}
