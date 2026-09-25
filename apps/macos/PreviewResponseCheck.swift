import AppKit
import Foundation

// Headless model-to-preview timing. It does not measure display presentation.
@main struct PreviewResponseCheck {
    @MainActor static func wait(_ ready: () -> Bool) async throws {
        for _ in 0..<2000 {
            if ready() { return }
            try await Task.sleep(for: .milliseconds(2))
        }
        throw RenderFailure(message: "Timed out waiting for preview")
    }

    @MainActor static func main() async throws {
        guard CommandLine.arguments.count == 2 else { fatalError("preview-response-check INPUT") }
        let model = ProjectModel(persist: false)
        model.load(URL(fileURLWithPath: CommandLine.arguments[1]))
        try await wait { model.preview?.size.width == 1000 && !model.isRendering }
        model.selectedID = "font-title"
        let start = ProcessInfo.processInfo.systemUptime
        model.previewTransform(["x": 0.53])
        try await wait { model.preview?.size.width == 500 && !model.isRendering }
        print("Draft preview response: \(ProcessInfo.processInfo.systemUptime - start) seconds")
    }
}
