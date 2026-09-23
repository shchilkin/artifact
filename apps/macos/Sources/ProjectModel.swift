import AppKit
import Foundation
import UniformTypeIdentifiers

struct TextProperties: Decodable, Equatable {
    let content: String
    let size: Double
    let color: String
    let x: Double
    let y: Double
}

struct LayerSummary: Decodable, Identifiable {
    let id: String
    let name: String
    let kind: String
    let scanlines: Double?
    let text: TextProperties?
}

struct SessionSummary: Decodable {
    let layers: [LayerSummary]
    let canUndo: Bool
    let canRedo: Bool
}

@MainActor
final class ProjectModel: ObservableObject {
    @Published var summary: SessionSummary?
    @Published var selectedID: String?
    @Published var fileName = "No project open"
    @Published var message: String?
    @Published var isModified = false
    @Published var preview: NSImage?
    @Published var isRendering = false
    @Published var renderMessage: String?
    static let previewSize: UInt32 = 1000
    static let exportSize: UInt32 = 3000
    @Published var isExporting = false
    @Published var exportMessage: String?
    private var exportTask: Task<Void, Never>?
    private let renderImage: (String) async throws -> CGImage
    private let renderPNGData: (String) async throws -> Data

    convenience init() {
        self.init(
            renderImage: { try await RenderWorker.shared.render(plan: $0) },
            renderPNGData: { try await RenderWorker.shared.png(plan: $0) }
        )
    }

    init(
        renderImage: @escaping (String) async throws -> CGImage,
        renderPNGData: @escaping (String) async throws -> Data
    ) {
        self.renderImage = renderImage
        self.renderPNGData = renderPNGData
    }

    private var renderRevision = 0
    private var renderTask: Task<Void, Never>?

    private func refreshPreview() {
        renderRevision += 1
        let revision = renderRevision
        renderTask?.cancel()
        exportTask?.cancel()
        isExporting = false
        exportMessage = nil
        preview = nil
        guard let session else { return }
        do {
            let plan = try session.renderPlanJson(width: Self.previewSize, height: Self.previewSize)
            isRendering = true
            renderMessage = nil
            let render = renderImage
            renderTask = Task { [weak self] in
                let result: Result<CGImage, Error>
                do { result = .success(try await render(plan)) }
                catch { result = .failure(error) }
                guard let self, self.renderRevision == revision, !Task.isCancelled else { return }
                self.isRendering = false
                switch result {
                case .success(let image): self.preview = NSImage(cgImage: image, size: NSSize(width: image.width, height: image.height))
                case .failure(let error): self.renderMessage = self.displayMessage(error)
                }
            }
        } catch {
            isRendering = false
            renderMessage = displayMessage(error)
        }
    }

    func exportPNG() {
        guard session != nil, !isExporting else { return }
        let panel = NSSavePanel()
        panel.allowedContentTypes = [.png]
        panel.nameFieldStringValue = "\(URL(fileURLWithPath: fileName).deletingPathExtension().lastPathComponent).png"
        guard panel.runModal() == .OK, let url = panel.url else { return }
        exportPNG(to: url)
    }

    // Export always renders a fresh full-size plan. An edit/open invalidates it
    // before it can write, even if a renderer ignores cooperative cancellation.
    func exportPNG(to url: URL) {
        guard let session, !isExporting else { return }
        let revision = renderRevision
        do {
            let plan = try session.renderPlanJson(width: Self.exportSize, height: Self.exportSize)
            let render = renderPNGData
            isExporting = true
            exportMessage = nil
            exportTask = Task { [weak self] in
                do {
                    let data = try await render(plan)
                    guard let self, self.renderRevision == revision, !Task.isCancelled else { return }
                    try data.write(to: url, options: .atomic)
                    self.isExporting = false
                } catch {
                    guard let self, self.renderRevision == revision, !Task.isCancelled else { return }
                    self.isExporting = false
                    self.exportMessage = self.displayMessage(error)
                }
            }
        } catch { exportMessage = displayMessage(error) }
    }
    private var session: NativeSession?
    private var savedJSON = ""

    var selected: LayerSummary? { summary?.layers.first { $0.id == selectedID } }

    private func displayMessage(_ error: Error) -> String {
        if case let SessionError.Invalid(message) = error { return message }
        return error.localizedDescription
    }

    func confirmDiscard() -> Bool {
        guard isModified else { return true }
        let alert = NSAlert()
        alert.messageText = "Discard unsaved changes?"
        alert.informativeText = "Save a copy first if you want to keep your changes."
        alert.addButton(withTitle: "Cancel")
        alert.addButton(withTitle: "Discard Changes")
        return alert.runModal() == .alertSecondButtonReturn
    }

    func open() {
        guard confirmDiscard() else { return }
        let panel = NSOpenPanel()
        panel.allowedContentTypes = [UTType(filenameExtension: "artifact") ?? .json, .json]
        panel.allowsMultipleSelection = false
        guard panel.runModal() == .OK, let url = panel.url else { return }
        load(url)
    }

    func load(_ url: URL) {
        do {
            let values = try url.resourceValues(forKeys: [.fileSizeKey])
            guard (values.fileSize ?? 0) <= 64 * 1024 * 1024 else {
                throw CocoaError(.fileReadTooLarge)
            }
            let candidate = try NativeSession.open(source: String(contentsOf: url, encoding: .utf8))
            let nextSummary = try JSONDecoder().decode(SessionSummary.self, from: Data(candidate.summaryJson().utf8))
            let nextJSON = try candidate.exportJson()
            session = candidate
            summary = nextSummary
            savedJSON = nextJSON
            selectedID = nextSummary.layers.first(where: { ($0.scanlines ?? 0) > 0 })?.id
                ?? nextSummary.layers.first?.id
            fileName = url.lastPathComponent
            isModified = false
            message = nil
            refreshPreview()
        } catch { message = displayMessage(error) }
    }

    func editScanlines(_ amount: Double) {
        guard let session, let selectedID else { return }
        perform { _ = try session.setScanlines(layerId: selectedID, amount: amount) }
    }

    func editText(_ patch: [String: Any]) {
        guard let session, let selectedID else { return }
        perform {
            let json = try JSONSerialization.data(withJSONObject: patch, options: [.sortedKeys])
            _ = try session.setText(layerId: selectedID, patchJson: String(decoding: json, as: UTF8.self))
        }
    }

    func undo() { guard let session else { return }; perform { _ = try session.undo() } }
    func redo() { guard let session else { return }; perform { _ = try session.redo() } }

    private func perform(_ action: () throws -> Void) {
        do {
            try action()
            if let session {
                summary = try JSONDecoder().decode(SessionSummary.self, from: Data(session.summaryJson().utf8))
                isModified = try session.exportJson() != savedJSON
                refreshPreview()
            }
            message = nil
        } catch { message = displayMessage(error) }
    }

    func saveCopy() {
        guard let session else { return }
        let panel = NSSavePanel()
        panel.allowedContentTypes = [UTType(filenameExtension: "artifact") ?? .json]
        panel.nameFieldStringValue = "\(URL(fileURLWithPath: fileName).deletingPathExtension().lastPathComponent)-copy.artifact"
        guard panel.runModal() == .OK, let url = panel.url else { return }
        do {
            let source = try session.exportJson()
            try Data(source.utf8).write(to: url, options: .atomic)
            savedJSON = source
            fileName = url.lastPathComponent
            isModified = false
            message = nil
        } catch { message = displayMessage(error) }
    }
}
