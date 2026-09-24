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

struct ImageProperties: Decodable, Equatable {
    let x: Double
    let y: Double
    let scaleX: Double
    let scaleY: Double
    let rotation: Double
}

struct LayerSummary: Decodable, Identifiable {
    let id: String
    let name: String
    let kind: String
    let scanlines: Double?
    let text: TextProperties?
    let image: ImageProperties?
}

struct SessionSummary: Decodable {
    let layers: [LayerSummary]
    let canUndo: Bool
    let canRedo: Bool
}

@MainActor
final class ProjectModel: ObservableObject {
    @Published private(set) var documentRevision = 0
    @Published var editor = EditorState()
    struct InspectorDraft {
        let values: [String: String]
        let patch: [String: Any]
        let valid: Bool
    }
    @Published private(set) var inspectorDrafts: [String: InspectorDraft] = [:]
    func stageInspector(_ id: String, values: [String: String], patch: [String: Any], valid: Bool) {
        if patch.isEmpty && valid { inspectorDrafts.removeValue(forKey: id) }
        else { inspectorDrafts[id] = InspectorDraft(values: values, patch: patch, valid: valid) }
        updateModified()
    }
    func discardInspector(_ id: String) {
        inspectorDrafts.removeValue(forKey: id)
        updateModified()
    }
    private func updateModified() {
        isModified = !inspectorDrafts.isEmpty || ((try? session?.exportJson()) != savedJSON)
    }
    @discardableResult func applyInspector(_ id: String) -> Bool {
        guard let draft = inspectorDrafts[id] else { return true }
        guard draft.valid else { message = "Check the values in the layer inspector before saving."; return false }
        guard command(["type": "edit_layer", "id": id, "patch": draft.patch]) else { return false }
        inspectorDrafts.removeValue(forKey: id)
        updateModified()
        return true
    }
    private func applyInspectors() -> Bool {
        for id in inspectorDrafts.keys.sorted() { if !applyInspector(id) { selectedID = id; return false } }
        return true
    }
    @Published var recentFiles: [URL] = []
    @Published var recoveryAvailable = false
    @Published var isImporting = false
    private var currentURL: URL?
    private let persistenceEnabled: Bool
    private static var recoveryURL: URL {
        FileManager.default.urls(for: .applicationSupportDirectory, in: .userDomainMask)[0]
            .appendingPathComponent("Artifact Workspace/recovery.artifact")
    }
    @Published var summary: SessionSummary?
    @Published var selectedID: String?
    @Published var fileName = "No project open"
    @Published var message: String?
    @Published var isModified = false
    @Published var preview: NSImage?
    @Published private(set) var canvasAspect = "1:1"
    @Published var isRendering = false
    @Published var renderMessage: String?
    static let previewSize: UInt32 = 1000
    static let exportSize: UInt32 = 3000
    @Published var isExporting = false
    @Published var exportMessage: String?
    private var exportTask: Task<Void, Never>?
    private let renderImage: (String) async throws -> CGImage
    private let renderPNGData: (String) async throws -> Data

    convenience init(persist: Bool = true) {
        self.init(
            renderImage: { try await RenderWorker.shared.render(plan: $0) },
            renderPNGData: { try await RenderWorker.shared.png(plan: $0) }, persist: persist
        )
    }

    init(
        renderImage: @escaping (String) async throws -> CGImage,
        renderPNGData: @escaping (String) async throws -> Data,
        persist: Bool = false
    ) {
        self.renderImage = renderImage
        self.renderPNGData = renderPNGData
        self.persistenceEnabled = persist
        if persist {
            recentFiles = (UserDefaults.standard.stringArray(forKey: "artifactRecentFiles") ?? []).map { URL(fileURLWithPath: $0) }
            recoveryAvailable = FileManager.default.fileExists(atPath: Self.recoveryURL.path)
        }
    }

    private var renderRevision = 0
    private var renderTask: Task<Void, Never>?

    var previewDimensions: NativeCanvasDimensions { NativeCanvasDimensions.base(canvasAspect).fit(maxSide: Self.previewSize) }
    var exportDimensions: NativeCanvasDimensions {
        canvasAspect == "1:1" ? NativeCanvasDimensions(width: Self.exportSize, height: Self.exportSize)
            : NativeCanvasDimensions.base(canvasAspect)
    }

    private func aspect(in source: String) -> String? {
        guard let package = try? JSONSerialization.jsonObject(with: Data(source.utf8)) as? [String: Any],
              let document = package["document"] as? [String: Any],
              let global = document["global"] as? [String: Any],
              let aspect = global["aspect"] as? String else { return nil }
        return aspect
    }
    private func syncAspect() {
        guard let session, let source = try? session.exportJson(), let aspect = aspect(in: source) else { return }
        canvasAspect = aspect
    }

    private func refreshPreview() {
        documentRevision += 1
        renderRevision += 1
        let revision = renderRevision
        renderTask?.cancel()
        exportTask?.cancel()
        isExporting = false
        exportMessage = nil
        guard let session else { return }
        do {
            let dimensions = previewDimensions
            let plan = try session.renderPlanJson(width: dimensions.width, height: dimensions.height)
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

    // Sheets keep the app event loop available to keyboard and accessibility.
    func presentFilePanel(_ panel: NSSavePanel, completion: @escaping (URL?) -> Void) {
        let finish: (NSApplication.ModalResponse) -> Void = { response in
            completion(response == .OK ? panel.url : nil)
        }
        if let window = NSApp.keyWindow ?? NSApp.windows.first(where: { $0.isVisible }) {
            panel.beginSheetModal(for: window, completionHandler: finish)
        } else { panel.begin(completionHandler: finish) }
    }
    func exportPNG() {
        guard session != nil, !isExporting, applyInspectors() else { return }
        let panel = NSSavePanel()
        panel.allowedContentTypes = [.png]
        panel.nameFieldStringValue = "\(URL(fileURLWithPath: fileName).deletingPathExtension().lastPathComponent).png"
        presentFilePanel(panel) { [weak self] url in if let url { self?.exportPNG(to: url) } }
    }

    // Export always renders a fresh full-size plan. An edit/open invalidates it
    // before it can write, even if a renderer ignores cooperative cancellation.
    func exportPNG(to url: URL) {
        guard let session, !isExporting, applyInspectors() else { return }
        let revision = renderRevision
        do {
            let dimensions = exportDimensions
            let plan = try session.renderPlanJson(width: dimensions.width, height: dimensions.height)
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

    func confirmDiscard(_ proceed: @escaping () -> Void) {
        guard isModified else { proceed(); return }
        let alert = NSAlert()
        alert.messageText = "Save changes before closing this project?"
        alert.informativeText = fileName
        alert.addButton(withTitle: "Save")
        alert.addButton(withTitle: "Cancel")
        alert.addButton(withTitle: "Discard Changes")
        let finish: (NSApplication.ModalResponse) -> Void = { [weak self] response in
            switch response {
            case .alertFirstButtonReturn: self?.save { if $0 { proceed() } }
            case .alertThirdButtonReturn: proceed()
            default: break
            }
        }
        if let window = NSApp.keyWindow ?? NSApp.windows.first(where: { $0.isVisible }) {
            alert.beginSheetModal(for: window, completionHandler: finish)
        } else { finish(alert.runModal()) }
    }

    func open() {
        confirmDiscard { [weak self] in
            guard let self else { return }
            let panel = NSOpenPanel()
            // Accept both portable .artifact packages and Web .artifact.json files.
            panel.allowedContentTypes = [UTType(filenameExtension: "artifact") ?? .json, .json]
            panel.allowsMultipleSelection = false
            presentFilePanel(panel) { [weak self] url in if let url { self?.load(url) } }
        }
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
            inspectorDrafts.removeAll()
            summary = nextSummary
            editor = try EditorState(json: candidate.editorStateJson())
            currentURL = url
            remember(url)
            savedJSON = nextJSON
            canvasAspect = aspect(in: nextJSON) ?? "1:1"
            selectedID = nextSummary.layers.first(where: { ($0.scanlines ?? 0) > 0 })?.id
                ?? nextSummary.layers.first?.id
            fileName = url.lastPathComponent
            isModified = false
            message = nil
            preview = nil
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

    func editImage(_ patch: [String: Any]) {
        guard let session, let selectedID else { return }
        perform {
            let json = try JSONSerialization.data(withJSONObject: patch, options: [.sortedKeys, .withoutEscapingSlashes])
            _ = try session.setImage(layerId: selectedID, patchJson: String(decoding: json, as: UTF8.self))
        }
    }

    func undo() {
        if !inspectorDrafts.isEmpty { inspectorDrafts.removeAll(); updateModified(); documentRevision += 1; return }
        guard let session else { return }; perform(mayChangeAspect: true) { _ = try session.undo() }
    }
    func redo() { guard let session else { return }; perform(mayChangeAspect: true) { _ = try session.redo() } }

    @discardableResult private func perform(mayChangeAspect: Bool = false, _ action: () throws -> Void) -> Bool {
        do {
            message = nil
            let beforeRevision = try session?.revision()
            try action()
            if let session {
                if try session.revision() == beforeRevision { return true }
                summary = try JSONDecoder().decode(SessionSummary.self, from: Data(session.summaryJson().utf8))
                editor = try EditorState(json: session.editorStateJson())
                if mayChangeAspect { syncAspect() }
                if !editor.layers.contains(where: { $0.id == selectedID }) { selectedID = editor.orderedLayers.last?.id }
                inspectorDrafts = inspectorDrafts.filter { id, _ in editor.layers.contains { $0.id == id } }
                updateModified()
                persistRecovery()
                refreshPreview()
            }
            return true
        } catch { message = displayMessage(error); return false }
    }

    var selectedLayer: EditorLayer? { editor.layers.first { $0.id == selectedID } }

    @discardableResult func command(_ command: [String: Any], select: String? = nil) -> Bool {
        guard let session else { return false }
        return perform(mayChangeAspect: command["type"] as? String == "patch_global") {
            let bytes = try JSONSerialization.data(withJSONObject: command, options: [.sortedKeys, .withoutEscapingSlashes])
            _ = try session.execute(commandJson: String(decoding: bytes, as: UTF8.self))
            if let select { selectedID = select }
        }
    }
    func previewTransform(_ patch: [String: Double]) {
        guard let session, let selectedID else { return }
        renderTask?.cancel()
        let revision = renderRevision
        renderTask = Task { [weak self] in
            do {
                try await Task.sleep(for: .milliseconds(16))
                let json = try JSONSerialization.data(withJSONObject: patch)
                let plan = try session.draftPlanJson(layerId: selectedID, patchJson: String(decoding: json, as: UTF8.self), size: 500)
                let image = try await RenderWorker.shared.render(plan: plan)
                guard let self, !Task.isCancelled, renderRevision == revision, self.selectedID == selectedID else { return }
                isRendering = false
                preview = NSImage(cgImage: image, size: NSSize(width: image.width, height: image.height))
            } catch { /* A superseded pointer draft has no durable state. */ }
        }
    }
    func cancelTransformPreview() { refreshPreview() }
    func editProperties(_ patch: [String: Any]) {
        guard let selectedID else { return }
        command(["type": "edit_layer", "id": selectedID, "patch": patch])
    }
    func addLayer(_ kind: String, src: String? = nil) {
        let id = "layer-" + UUID().uuidString.lowercased()
        var c: [String: Any] = ["type": "add_layer", "kind": kind, "newId": id]
        if let selectedID { c["afterId"] = selectedID }
        if let src { c["src"] = src }
        command(c, select: id)
    }
    func duplicate() {
        guard let selectedID else { return }
        let id = "layer-" + UUID().uuidString.lowercased()
        command(["type": "duplicate_layer", "id": selectedID, "newId": id], select: id)
    }
    func deleteSelected() { guard let selectedID else { return }; command(["type": "delete_layer", "id": selectedID]) }
    func moveSelected(_ delta: Int) { guard let selectedID else { return }; command(["type": "move_layer", "id": selectedID, "delta": delta]) }
    func importLayer() {
        let panel = NSOpenPanel(); panel.allowedContentTypes = [.png, .jpeg]; panel.allowsMultipleSelection = false
        presentFilePanel(panel) { [weak self] url in
            guard let self, let url else { return }
            let revision = documentRevision
            isImporting = true
            Task {
                defer { self.isImporting = false }
                do {
                    let src = try await ImageImport.shared.read(url)
                    guard self.documentRevision == revision else { return }
                    self.addLayer("image", src: src)
                } catch { self.message = self.displayMessage(error) }
            }
        }
    }
    func newDocument() {
        confirmDiscard { [weak self] in
            guard let self else { return }
            do {
                session = try NativeSession.open(source: newProject())
                inspectorDrafts.removeAll()
                summary = try JSONDecoder().decode(SessionSummary.self, from: Data(session!.summaryJson().utf8))
                editor = try EditorState(json: session!.editorStateJson())
                currentURL = nil; savedJSON = ""; fileName = "Untitled.artifact"; selectedID = nil; canvasAspect = "1:1"
                isModified = true; message = nil; preview = nil; persistRecovery(); refreshPreview()
            } catch { message = displayMessage(error) }
        }
    }
    func openURL(_ url: URL) { confirmDiscard { [weak self] in self?.load(url) } }
    private func remember(_ url: URL) {
        guard persistenceEnabled, url != Self.recoveryURL else { return }
        recentFiles.removeAll { $0 == url }; recentFiles.insert(url, at: 0)
        recentFiles = Array(recentFiles.prefix(10))
        UserDefaults.standard.set(recentFiles.map(\.path), forKey: "artifactRecentFiles")
        NSDocumentController.shared.noteNewRecentDocumentURL(url)
    }
    private func persistRecovery() {
        guard persistenceEnabled, let session, isModified else { return }
        do {
            let url = Self.recoveryURL
            try FileManager.default.createDirectory(at: url.deletingLastPathComponent(), withIntermediateDirectories: true)
            try Data(session.exportJson().utf8).write(to: url, options: .atomic)
            recoveryAvailable = true
        } catch { message = "Could not save recovery draft: " + error.localizedDescription }
    }
    func restoreRecovery() {
        confirmDiscard { [weak self] in
            guard let self else { return }
            load(Self.recoveryURL)
            if currentURL == Self.recoveryURL { currentURL = nil; fileName = "Recovered.artifact"; savedJSON = ""; isModified = true }
        }
    }
    func save(completion: @escaping (Bool) -> Void = { _ in }) {
        guard let url = currentURL else { saveCopy(completion: completion); return }
        completion(save(to: url))
    }
    @discardableResult func save(to url: URL) -> Bool {
        guard let session, applyInspectors() else { return false }
        do {
            let source = try session.exportJson()
            try Data(source.utf8).write(to: url, options: .atomic)
            currentURL = url; savedJSON = source; fileName = url.lastPathComponent
            isModified = false; message = nil; remember(url)
            if persistenceEnabled { try? FileManager.default.removeItem(at: Self.recoveryURL); recoveryAvailable = false }
            return true
        } catch { message = displayMessage(error); return false }
    }
    func saveCopy(completion: @escaping (Bool) -> Void = { _ in }) {
        guard session != nil else { completion(false); return }
        let panel = NSSavePanel()
        panel.allowedContentTypes = [UTType(filenameExtension: "artifact") ?? .json]
        panel.allowsOtherFileTypes = true
        panel.nameFieldStringValue = "\(URL(fileURLWithPath: fileName).deletingPathExtension().lastPathComponent)-copy.artifact"
        presentFilePanel(panel) { [weak self] url in
            guard let self, let url else { completion(false); return }
            completion(save(to: url))
        }
    }
}
