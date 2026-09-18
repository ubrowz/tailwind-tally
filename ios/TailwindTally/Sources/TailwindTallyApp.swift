import SwiftUI

// The whole app is a thin native shell around the real Tailwind Tally
// web app (github.com/ubrowz/tailwind-tally) - same map, charts, Strava
// import and backend, unchanged. The one thing this shell adds is being
// a registered handler for .gpx files (see Info.plist), so a route
// shared from Strava's app, Mail, AirDrop or Files can be opened
// straight into the already-running page via WebViewCoordinator.
private let tailwindTallyURL = URL(string: "https://ubrowz.github.io/tailwind-tally/")!

@main
struct TailwindTallyApp: App {
    @StateObject private var coordinator = WebViewCoordinator()

    var body: some Scene {
        WindowGroup {
            ZStack {
                WebView(url: tailwindTallyURL, coordinator: coordinator)
                    .ignoresSafeArea(edges: .bottom)

                if let message = coordinator.loadError {
                    LoadErrorView(message: message) {
                        coordinator.reload(url: tailwindTallyURL)
                    }
                } else if coordinator.isLoading {
                    ProgressView()
                        .progressViewStyle(.circular)
                }
            }
            .onOpenURL { url in
                coordinator.handleIncomingFile(at: url)
            }
        }
    }
}

private struct LoadErrorView: View {
    let message: String
    let retry: () -> Void

    var body: some View {
        VStack(spacing: 12) {
            Text("Couldn't load Tailwind Tally")
                .font(.headline)
            Text(message)
                .font(.subheadline)
                .foregroundStyle(.secondary)
                .multilineTextAlignment(.center)
            Button("Try Again", action: retry)
                .buttonStyle(.borderedProminent)
        }
        .padding(24)
        .background(Color(.systemBackground).opacity(0.95))
    }
}
