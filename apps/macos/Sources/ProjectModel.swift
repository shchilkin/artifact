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
    private var activeInspector: (id: String, transaction: UInt64, durableJSON: String)?
    func stageInspector(_ id: String, values: [String: String], patch: [String: Any], valid: Bool) {
        if patch.isEmpty && valid { inspectorDrafts.removeValue(forKey: id) }
        else { inspectorDrafts[id] = InspectorDraft(values: values, patch: patch, valid: valid) }
        if let session {
            do {
                if let activeInspector, activeInspector.id != id { _ = applyInspector(activeInspector.id) }
                if !valid || patch.isEmpty {
                    if let activeInspector, activeInspector.id == id {
                        try NativeCommandService.finish(session, id: activeInspector.transaction, commit: false)
                        self.activeInspector = nil
                        geometryResolver.invalidate()
                        editor = try EditorState(json: session.editorStateJson())
                        refreshPreview(documentChanged: false)
                    }
                } else {
                    let prior = activeInspector
                    let durableJSON = try prior?.durableJSON ?? session.exportJson()
                    let transaction = try prior?.transaction ?? NativeCommandService.begin(session)
                    self.activeInspector = (id, transaction, durableJSON)
                    try NativeCommandService.update(session, id: transaction,
                        commands: [["type": "patch_layer", "id": id, "patch": patch]])
                    if patch["src"] != nil { geometryResolver.invalidate() }
                    editor = try EditorState(json: session.editorStateJson())
                    refreshPreview(documentChanged: false)
                }
            } catch {
                if let activeInspector, activeInspector.id == id {
                    try? NativeCommandService.finish(session, id: activeInspector.transaction, commit: false)
                    self.activeInspector = nil
                    geometryResolver.invalidate()
                    if let state = try? EditorState(json: session.editorStateJson()) { editor = state }
                    refreshPreview(documentChanged: false)
                }
                inspectorDrafts[id] = InspectorDraft(values: values, patch: patch, valid: false)
                message = displayMessage(error)
            }
        }
        filePanelGeneration += 1
        updateModified()
        persistRecovery()
    }
    func discardInspector(_ id: String) {
        if let session, let activeInspector, activeInspector.id == id {
            try? NativeCommandService.finish(session, id: activeInspector.transaction, commit: false)
            self.activeInspector = nil
            geometryResolver.invalidate()
            if let state = try? EditorState(json: session.editorStateJson()) { editor = state }
            refreshPreview(documentChanged: false)
        }
        inspectorDrafts.removeValue(forKey: id)
        filePanelGeneration += 1
        updateModified()
        persistRecovery()
    }
    private func updateModified() {
        isModified = !inspectorDrafts.isEmpty || ((activeInspector?.durableJSON ?? (try? session?.exportJson())) != savedJSON)
    }
    @discardableResult func applyInspector(_ id: String) -> Bool {
        guard let draft = inspectorDrafts[id] else { return true }
        guard draft.valid else { message = "Check the values in the layer inspector before saving."; return false }
        if let activeInspector, activeInspector.id == id, let session {
            self.activeInspector = nil
            guard perform({ try NativeCommandService.finish(session, id: activeInspector.transaction, commit: true) }) else {
                self.activeInspector = activeInspector
                return false
            }
        } else if !draft.patch.isEmpty {
            guard command(["type": "edit_layer", "id": id, "patch": draft.patch]) else { return false }
        }
        inspectorDrafts.removeValue(forKey: id)
        filePanelGeneration += 1
        updateModified()
        persistRecovery()
        return true
    }
    private func applyInspectors() -> Bool {
        for id in inspectorDrafts.keys.sorted() { if !applyInspector(id) { selectedID = id; return false } }
        return true
    }
    @Published var recentFiles: [URL] = []
    @Published var recoveryAvailable = false
    @Published private(set) var isImporting = false
    private var activeImports = 0
    private func beginImport() { activeImports += 1; isImporting = true }
    private func endImport() { activeImports -= 1; isImporting = activeImports > 0 }
    private var currentURL: URL?
    private let persistenceEnabled: Bool
    private let recoveryFileURL: URL
    private let preferences: UserDefaults
    private static var recoveryURL: URL {
        FileManager.default.urls(for: .applicationSupportDirectory, in: .userDomainMask)[0]
            .appendingPathComponent("Artifact Workspace/recovery.artifact")
    }
    @Published var summary: SessionSummary?
    @Published var renameRequestID: String?
    @Published var isTextEditing = false
    @Published var selectedIDs: Set<String> = []
    @Published var selectedID: String? {
        didSet {
            if let selectedID, !selectedIDs.contains(selectedID) { selectedIDs = [selectedID] }
            if selectedID == nil { selectedIDs = [] }
        }
    }
    private var selectionAnchor: String?
    private let geometryResolver = LayerGeometryResolver()
    @Published var fileName = "No project open"
    @Published var message: String?
    @Published var isModified = false
    @Published var preview: NSImage?
    @Published private(set) var canvasAspect = "1:1"
    @Published private(set) var hasGraph = false
    @Published var isRendering = false
    @Published var renderMessage: String?
    static let previewSize: UInt32 = 1000
    @Published var isExporting = false
    @Published var exportMessage: String?
    private var exportTask: Task<Void, Never>?
    private let renderImage: (String) async throws -> CGImage
    private let renderExportData: (String, Int, NativeExportFormat) async throws -> Data
    private let readClipboardImage: (Data) async throws -> String
    private(set) var filePanelGeneration = 0
    func filePanelIsCurrent(_ generation: Int) -> Bool { filePanelGeneration == generation }

    convenience init(persist: Bool = true) {
        self.init(
            renderImage: { try await RenderWorker.shared.render(plan: $0) },
            renderExportData: { try await RenderWorker.shared.export(plan: $0, scale: $1, format: $2) }, persist: persist
        )
    }

    init(
        renderImage: @escaping (String) async throws -> CGImage,
        renderExportData: @escaping (String, Int, NativeExportFormat) async throws -> Data,
        readClipboardImage: @escaping (Data) async throws -> String = { try ImageImport.shared.readClipboard($0) },
        persist: Bool = false,
        recoveryURL: URL? = nil,
        preferences: UserDefaults = .standard
    ) {
        self.renderImage = renderImage
        self.renderExportData = renderExportData
        self.readClipboardImage = readClipboardImage
        self.persistenceEnabled = persist
        self.recoveryFileURL = recoveryURL ?? Self.recoveryURL
        self.preferences = preferences
        if persist {
            recentFiles = (preferences.stringArray(forKey: "artifactRecentFiles") ?? []).map { URL(fileURLWithPath: $0) }
            recoveryAvailable = FileManager.default.fileExists(atPath: self.recoveryFileURL.path)
        }
    }

    private var renderRevision = 0
    private var renderTask: Task<Void, Never>?
    private var hasTransientPreview = false

    var previewDimensions: NativeCanvasDimensions { NativeCanvasDimensions.base(canvasAspect).fit(maxSide: Self.previewSize) }
    var exportDimensions: NativeCanvasDimensions { NativeCanvasDimensions.base(canvasAspect) }

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
    private func syncGraph() {
        guard let session, let source = try? session.exportJson(),
              let package = try? JSONSerialization.jsonObject(with: Data(source.utf8)) as? [String: Any],
              let document = package["document"] as? [String: Any] else { hasGraph = false; return }
        hasGraph = document["graph"] is [String: Any]
    }

    private func refreshPreview(documentChanged: Bool = true) {
        renderRevision += 1
        if documentChanged {
            documentRevision += 1
            filePanelGeneration += 1
            exportTask?.cancel()
            isExporting = false
            exportMessage = nil
        }
        hasTransientPreview = false
        let revision = renderRevision
        renderTask?.cancel()
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
    func exportPNG() { exportFile(format: .png) }
    func exportJPEG() { exportFile(format: .jpeg) }
    func exportFile(format: NativeExportFormat, scale: Int? = nil) {
        guard session != nil, !isExporting, applyInspectors() else { return }
        do {
            guard let session else { return }
            let source = try session.exportJson()
            if let root = try JSONSerialization.jsonObject(with: Data(source.utf8)) as? [String: Any],
               let document = root["document"] as? [String: Any],
               let notice = ProjectFileService.dependencyNotice(document) {
                exportMessage = notice
                return
            }
            let dimensions = exportDimensions
            _ = try session.renderPlanJson(width: dimensions.width, height: dimensions.height)
        } catch { exportMessage = displayMessage(error); return }
        let requestedRevision = filePanelGeneration
        let panel = NSSavePanel()
        panel.allowedContentTypes = [format.type]
        panel.nameFieldStringValue = "\(URL(fileURLWithPath: fileName).deletingPathExtension().lastPathComponent).\(format.extensionName)"
        presentFilePanel(panel) { [weak self] url in
            guard let self, let url else { return }
            guard self.filePanelIsCurrent(requestedRevision) else {
                self.exportMessage = "Project changed while export was open. Choose export again."
                return
            }
            self.export(to: url, format: format, scale: scale)
        }
    }

    // Export always renders a fresh full-size plan. An edit/open invalidates it
    // before it can write, even if a renderer ignores cooperative cancellation.
    func exportPNG(to url: URL) { export(to: url, format: .png) }
    func export(to url: URL, format: NativeExportFormat, scale: Int? = nil) {
        guard let session, !isExporting, applyInspectors() else { return }
        let revision = renderRevision
        do {
            let source = try session.exportJson()
            let selectedScale = scale ?? exportScale(in: source)
            guard (1...3).contains(selectedScale) else { throw RenderFailure(message: "Choose export scale 1, 2 or 3.") }
            let dimensions = exportDimensions
            let plan = try session.renderPlanJson(width: dimensions.width, height: dimensions.height)
            let render = renderExportData
            isExporting = true
            exportMessage = nil
            exportTask = Task { [weak self] in
                do {
                    let data = try await render(plan, selectedScale, format)
                    guard let self, self.renderRevision == revision, !Task.isCancelled else { return }
                    try ProjectFileService.writeExport(data, to: url)
                    self.isExporting = false
                } catch {
                    guard let self, self.renderRevision == revision, !Task.isCancelled else { return }
                    self.isExporting = false
                    self.exportMessage = self.displayMessage(error)
                }
            }
        } catch { exportMessage = displayMessage(error) }
    }
    private func exportScale(in source: String) -> Int {
        guard let root = try? JSONSerialization.jsonObject(with: Data(source.utf8)) as? [String: Any],
              let document = root["document"] as? [String: Any],
              let config = document["export"] as? [String: Any] else { return 1 }
        return config["scale"] as? Int ?? 1
    }
    private var session: NativeSession?
    private var savedJSON = ""

    var selected: LayerSummary? { summary?.layers.first { $0.id == selectedID } }

    private func displayMessage(_ error: Error) -> String {
        if case let SessionError.Invalid(message) = error { return message }
        return error.localizedDescription
    }

    enum StartupRecoveryChoice { case restore, discard, cancel }
    var needsStartupRecoveryChoice: Bool { session == nil && recoveryAvailable }

    func resolveStartupRecovery(_ choice: StartupRecoveryChoice, proceed: () -> Void) {
        switch choice {
        case .restore: restoreRecoveryNow()
        case .discard: proceed() // The recovery file remains until New/Open succeeds.
        case .cancel: break
        }
    }

    func confirmDiscard(purgeOnDiscard: Bool = false, _ proceed: @escaping () -> Void) {
        if needsStartupRecoveryChoice {
            let alert = NSAlert()
            alert.messageText = "Restore the unsaved project?"
            alert.informativeText = "New or Open will replace the recovery only after it succeeds. Canceling a file picker keeps it."
            alert.addButton(withTitle: "Restore")
            alert.addButton(withTitle: "Discard and Continue")
            alert.addButton(withTitle: "Cancel")
            let finish: (NSApplication.ModalResponse) -> Void = { [weak self] response in
                switch response {
                case .alertFirstButtonReturn: self?.resolveStartupRecovery(.restore, proceed: proceed)
                case .alertSecondButtonReturn: self?.resolveStartupRecovery(.discard, proceed: proceed)
                default: self?.resolveStartupRecovery(.cancel, proceed: proceed)
                }
            }
            if let window = NSApp.keyWindow ?? NSApp.windows.first(where: { $0.isVisible }) {
                alert.beginSheetModal(for: window, completionHandler: finish)
            } else { finish(alert.runModal()) }
            return
        }
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
            case .alertThirdButtonReturn:
                if purgeOnDiscard { self?.discardRecovery() }
                proceed()
            default: break
            }
        }
        if let window = NSApp.keyWindow ?? NSApp.windows.first(where: { $0.isVisible }) {
            alert.beginSheetModal(for: window, completionHandler: finish)
        } else { finish(alert.runModal()) }
    }
    private func discardRecovery() {
        guard persistenceEnabled else { return }
        do {
            try ProjectFileService.clearRecovery(at: recoveryFileURL)
            recoveryAvailable = false
        } catch { message = "Could not discard recovery draft: " + error.localizedDescription }
    }

    func open() {
        confirmDiscard { [weak self] in
            guard let self else { return }
            let panel = NSOpenPanel()
            // Imported .artifact files may have an older or unregistered UTI.
            // Validate the package after selection instead of excluding valid files.
            panel.allowedContentTypes = [.data]
            panel.allowsMultipleSelection = false
            presentFilePanel(panel) { [weak self] url in if let url { self?.load(url) } }
        }
    }

    func load(_ url: URL) {
        do {
            let opened = try ProjectFileService.read(url)
            let candidate = try NativeSession.open(source: opened.source)
            let nextSummary = try JSONDecoder().decode(SessionSummary.self, from: Data(candidate.summaryJson().utf8))
            let nextJSON = try candidate.exportJson()
            session = candidate
            activeInspector = nil
            inspectorDrafts.removeAll()
            summary = nextSummary
            editor = try EditorState(json: candidate.editorStateJson())
            currentURL = url
            remember(url)
            savedJSON = nextJSON
            canvasAspect = aspect(in: nextJSON) ?? "1:1"
            syncGraph()
            selectedIDs = []
            selectedID = nextSummary.layers.first(where: { ($0.scanlines ?? 0) > 0 })?.id
                ?? nextSummary.layers.first?.id
            selectionAnchor = selectedID
            fileName = url.lastPathComponent
            isModified = false
            message = opened.notice
            preview = nil
            if url != recoveryFileURL { discardRecovery() }
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
        if !inspectorDrafts.isEmpty {
            if let activeInspector { discardInspector(activeInspector.id) }
            inspectorDrafts.removeAll(); updateModified(); persistRecovery()
            filePanelGeneration += 1
            return
        }
        guard let session else { return }; perform(mayChangeAspect: true) { _ = try session.undo() }
    }
    func redo() { guard let session else { return }; perform(mayChangeAspect: true) { _ = try session.redo() } }

    @discardableResult private func perform(mayChangeAspect: Bool = false, _ action: () throws -> Void) -> Bool {
        do {
            message = nil
            let beforeRevision = try session?.revision()
            try action()
            if let session {
                if try session.revision() == beforeRevision {
                    if hasTransientPreview { refreshPreview(documentChanged: false) }
                    return true
                }
                summary = try JSONDecoder().decode(SessionSummary.self, from: Data(session.summaryJson().utf8))
                editor = try EditorState(json: session.editorStateJson())
                syncGraph()
                if mayChangeAspect { syncAspect() }
                if !editor.layers.contains(where: { $0.id == selectedID }) { selectedID = editor.orderedLayers.last?.id }
                selectedIDs = selectedIDs.filter { id in editor.layers.contains { $0.id == id } }
                inspectorDrafts = inspectorDrafts.filter { id, _ in editor.layers.contains { $0.id == id } }
                updateModified()
                persistRecovery()
                refreshPreview()
            }
            return true
        } catch {
            if hasTransientPreview { refreshPreview(documentChanged: false) }
            message = displayMessage(error)
            return false
        }
    }

    var selectedLayer: EditorLayer? { editor.layers.first { $0.id == selectedID } }
    var canDirectEdit: Bool { !hasGraph || editor.canReorder }

    func inspectorOriginal(_ id: String) -> EditorLayer? {
        if let activeInspector, activeInspector.id == id,
           let root = try? JSONSerialization.jsonObject(with: Data(activeInspector.durableJSON.utf8)) as? [String: Any],
           let document = root["document"] as? [String: Any],
           let layers = document["layers"] as? [[String: Any]],
           let layer = layers.first(where: { $0["id"] as? String == id }) {
            return EditorLayer(raw: layer)
        }
        return editor.layers.first { $0.id == id }
    }

    func selectLayer(_ id: String, extending: Bool = false, range: Bool = false) {
        guard editor.layers.contains(where: { $0.id == id }) else { return }
        if let activeInspector, activeInspector.id != id { _ = applyInspector(activeInspector.id) }
        let order = editor.orderedLayers.map(\.id)
        if range, let anchor = selectionAnchor, let a = order.firstIndex(of: anchor), let b = order.firstIndex(of: id) {
            selectedIDs = Set(order[min(a,b)...max(a,b)])
        } else if extending {
            if selectedIDs.contains(id) && selectedIDs.count > 1 { selectedIDs.remove(id) }
            else { selectedIDs.insert(id) }
            selectionAnchor = id
        } else {
            selectedIDs = [id]
            selectionAnchor = id
        }
        selectedID = selectedIDs.contains(id) ? id : selectedIDs.first
    }

    func syncPrimarySelection() {
        if let current = selectedID, selectedIDs.contains(current) { return }
        selectedID = editor.orderedLayers.reversed().first(where: { selectedIDs.contains($0.id) })?.id
        selectionAnchor = selectedID
    }
    func requestRename(_ id: String) {
        selectLayer(id)
        renameRequestID = id
    }

    func localBounds(for layer: EditorLayer) -> CGRect {
        guard let session else { return .null }
        do {
            if geometryResolver.needsUpdate(for: documentRevision) {
                try geometryResolver.update(documentJSON: session.exportJson(), revision: documentRevision)
            }
            return try geometryResolver.localBounds(layer.raw, width: Int(previewDimensions.width), height: Int(previewDimensions.height))
        } catch { return .null }
    }

    @discardableResult func transaction(_ commands: [[String: Any]]) -> Bool {
        guard let session, !commands.isEmpty else { return false }
        if let activeInspector, !applyInspector(activeInspector.id) { return false }
        return perform { try NativeCommandService.commit(session, commands: commands) }
    }

    func setSelectionProperties(_ patch: [String: Any]) {
        let ids = editor.orderedLayers.map(\.id).filter { selectedIDs.contains($0) }
        if ids.count > 1 { _ = transaction([["type": "patch_layers", "ids": ids, "patch": patch]]) }
        else if let id = ids.first { _ = command(["type": "edit_layer", "id": id, "patch": patch]) }
    }

    func reorderSelection(before targetID: String) {
        guard editor.canReorder, !selectedIDs.contains(targetID) else { return }
        let current = editor.orderedLayers.map(\.id)
        guard current.contains(targetID) else { return }
        let moving = current.filter { selectedIDs.contains($0) }
        guard !moving.isEmpty else { return }
        var desired = current.filter { !selectedIDs.contains($0) }
        guard let target = desired.firstIndex(of: targetID) else { return }
        desired.insert(contentsOf: moving, at: target)
        reorder(to: desired)
    }

    func moveSelection(_ delta: Int) {
        guard editor.canReorder, delta != 0 else { return }
        var desired = editor.orderedLayers.map(\.id)
        let indices = (delta > 0 ? Array(desired.indices.reversed()) : Array(desired.indices))
        for index in indices where selectedIDs.contains(desired[index]) {
            let next = index + (delta > 0 ? 1 : -1)
            if desired.indices.contains(next), !selectedIDs.contains(desired[next]) { desired.swapAt(index, next) }
        }
        reorder(to: desired)
    }

    private func reorder(to ids: [String]) {
        guard ids != editor.orderedLayers.map(\.id) else { return }
        _ = transaction([["type": "reorder_layers", "ids": ids]])
    }

    func createArea() {
        let ids = editor.orderedLayers.map(\.id).filter { selectedIDs.contains($0) }
        guard !ids.isEmpty else { return }
        let area: [String: Any] = ["id": "area-" + UUID().uuidString.lowercased(), "name": "Area", "color": "#637aa4",
                                   "nodeIds": ids, "collapsed": false]
        var commands: [[String: Any]] = []
        if !hasGraph { commands.append(["type": "bootstrap_graph"]) }
        commands.append(["type": "graph", "action": ["kind": "add_area", "area": area]])
        _ = transaction(commands)
    }
    func assignSelection(to areaID: String) {
        let existing = editor.areas.first(where: { $0.id == areaID })?.nodeIDs ?? []
        let ids = Array(Set(existing).union(selectedIDs)).sorted { a, b in
            let order = editor.orderedLayers.map(\.id)
            return (order.firstIndex(of: a) ?? Int.max) < (order.firstIndex(of: b) ?? Int.max)
        }
        _ = transaction([["type": "graph", "action": ["kind": "assign_area", "id": areaID, "node_ids": ids]]])
    }
    func removeSelectionFromAreas() {
        let commands: [[String: Any]] = editor.areas.filter { !$0.nodeIDs.filter(selectedIDs.contains).isEmpty }.map { area in
            ["type": "graph", "action": ["kind": "assign_area", "id": area.id,
                                        "node_ids": area.nodeIDs.filter { !selectedIDs.contains($0) }]]
        }
        _ = transaction(commands)
    }
    func setAreaCollapsed(_ id: String, _ collapsed: Bool) {
        _ = transaction([["type": "graph", "action": ["kind": "patch_area", "id": id, "patch": ["collapsed": collapsed]]]])
    }

    @discardableResult func command(_ command: [String: Any], select: String? = nil) -> Bool {
        guard let session else { return false }
        if let activeInspector, !applyInspector(activeInspector.id) { return false }
        return perform(mayChangeAspect: command["type"] as? String == "patch_global") {
            let bytes = try JSONSerialization.data(withJSONObject: command, options: [.sortedKeys, .withoutEscapingSlashes])
            _ = try session.execute(commandJson: String(decoding: bytes, as: UTF8.self))
            if let select { selectedID = select }
        }
    }
    func previewTransform(_ patch: [String: Double]) {
        guard let session, let selectedID else { return }
        hasTransientPreview = true
        renderTask?.cancel()
        let revision = renderRevision
        let render = renderImage
        renderTask = Task { [weak self] in
            do {
                try await Task.sleep(for: .milliseconds(16))
                let json = try JSONSerialization.data(withJSONObject: patch)
                let plan = try session.draftPlanJson(layerId: selectedID, patchJson: String(decoding: json, as: UTF8.self), size: 500)
                let image = try await render(plan)
                guard let self, !Task.isCancelled, renderRevision == revision, self.selectedID == selectedID else { return }
                isRendering = false
                preview = NSImage(cgImage: image, size: NSSize(width: image.width, height: image.height))
            } catch { /* A superseded pointer draft has no durable state. */ }
        }
    }
    func previewTransforms(_ patches: [String: [String: Double]]) {
        guard let session, !patches.isEmpty else { return }
        hasTransientPreview = true
        renderRevision += 1
        let revision = renderRevision
        renderTask?.cancel()
        let dimensions = previewDimensions.fit(maxSide: 500)
        let render = renderImage
        renderTask = Task { [weak self] in
            do {
                try await Task.sleep(for: .milliseconds(16))
                let source = try session.renderPlanJson(width: dimensions.width, height: dimensions.height)
                guard var plan = try JSONSerialization.jsonObject(with: Data(source.utf8)) as? [String: Any],
                      var layers = plan["layers"] as? [[String: Any]] else { return }
                for index in layers.indices {
                    guard let id = layers[index]["id"] as? String, let patch = patches[id] else { continue }
                    for (key, value) in patch { layers[index][key] = value }
                }
                plan["layers"] = layers
                if var nodes = plan["nodes"] as? [[String: Any]] {
                    for index in nodes.indices {
                        if let id = nodes[index]["id"] as? String, let patch = patches[id],
                           var config = nodes[index]["config"] as? [String: Any] {
                            for (key, value) in patch { config[key] = value }
                            nodes[index]["config"] = config
                        }
                        // A pointer draft must not hit a settled graph cache.
                        nodes[index]["cacheKey"] = "draft-\(revision)-\(index)"
                    }
                    plan["nodes"] = nodes
                }
                let bytes = try JSONSerialization.data(withJSONObject: plan, options: [.withoutEscapingSlashes])
                let image = try await render(String(decoding: bytes, as: UTF8.self))
                guard let self, !Task.isCancelled, self.renderRevision == revision else { return }
                self.isRendering = false
                self.preview = NSImage(cgImage: image, size: NSSize(width: image.width, height: image.height))
            } catch { /* Superseded local pointer draft. */ }
        }
    }
    func commitTransforms(_ patches: [String: [String: Double]]) {
        let commands = editor.orderedLayers.map(\.id).compactMap { id -> [String: Any]? in
            guard let patch = patches[id] else { return nil }
            return ["type": "patch_layer", "id": id, "patch": patch]
        }
        if commands.isEmpty { cancelTransformPreview(); return }
        _ = transaction(commands)
        if hasTransientPreview { refreshPreview(documentChanged: false) }
    }
    func cancelTransformPreview() {
        if hasTransientPreview { refreshPreview(documentChanged: false) }
    }
    func editProperties(_ patch: [String: Any]) {
        setSelectionProperties(patch)
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
    func duplicateSelection() {
        let ids = editor.orderedLayers.map(\.id).filter { selectedIDs.contains($0) }
        let commands: [[String: Any]] = ids.map { ["type": "duplicate_layer", "id": $0,
                                                  "new_id": "layer-" + UUID().uuidString.lowercased()] }
        if !commands.isEmpty { _ = transaction(commands) }
    }
    func deleteSelection() {
        let ids = editor.orderedLayers.map(\.id).filter { selectedIDs.contains($0) }
        _ = transaction(ids.map { ["type": "remove_layer", "id": $0] })
    }
    func deleteSelected() { guard let selectedID else { return }; command(["type": "delete_layer", "id": selectedID]) }
    func moveSelected(_ delta: Int) { guard let selectedID else { return }; command(["type": "move_layer", "id": selectedID, "delta": delta]) }
    func importLayer() {
        let panel = NSOpenPanel(); panel.allowedContentTypes = [.png, .jpeg]; panel.allowsMultipleSelection = false
        let requestedRevision = filePanelGeneration
        presentFilePanel(panel) { [weak self] url in
            guard let self, let url else { return }
            guard self.filePanelIsCurrent(requestedRevision) else { return }
            self.importImage(from: url)
        }
    }
    func importImage(from url: URL) {
        let revision = documentRevision
        beginImport()
        Task {
            defer { endImport() }
            do {
                let src = try await ImageImport.shared.read(url)
                guard documentRevision == revision else { return }
                addLayer("image", src: src)
            } catch { if documentRevision == revision { message = displayMessage(error) } }
        }
    }
    func pasteImage() {
        let board = NSPasteboard.general
        if let file = board.readObjects(forClasses: [NSURL.self])?.first as? URL {
            importImage(from: file)
            return
        }
        guard let data = board.data(forType: .png) ?? board.data(forType: NSPasteboard.PasteboardType("public.jpeg"))
                ?? board.data(forType: .tiff) else {
            message = "Clipboard has no image."
            return
        }
        importImage(data: data)
    }
    func importImage(data: Data) {
        let revision = documentRevision
        beginImport()
        Task {
            defer { endImport() }
            do {
                let src = try await readClipboardImage(data)
                guard documentRevision == revision else { return }
                addLayer("image", src: src)
            } catch { if documentRevision == revision { message = displayMessage(error) } }
        }
    }
    func importFont(to layerID: String, from url: URL) {
        guard session != nil, applyInspectors() else { return }
        let revision = documentRevision
        beginImport()
        Task {
            defer { endImport() }
            do {
                let imported = try await FontImport.shared.read(url)
                guard documentRevision == revision, let session,
                      editor.layers.contains(where: { $0.id == layerID && $0.kind == "text" }) else { return }
                _ = perform {
                    try NativeCommandService.commit(session, commands: [
                        ["type": "edit_assets", "collection": "fontAssets", "upsert": [imported.asset]],
                        ["type": "patch_layer", "id": layerID, "patch": ["font": imported.reference]]
                    ])
                }
            } catch { if documentRevision == revision { message = displayMessage(error) } }
        }
    }
    func newDocument() {
        confirmDiscard { [weak self] in
            guard let self else { return }
            do {
                session = try NativeSession.open(source: newProject())
                activeInspector = nil
                inspectorDrafts.removeAll()
                summary = try JSONDecoder().decode(SessionSummary.self, from: Data(session!.summaryJson().utf8))
                editor = try EditorState(json: session!.editorStateJson())
                syncGraph()
                currentURL = nil; savedJSON = ""; fileName = "Untitled.artifact"; selectedID = nil; canvasAspect = "1:1"
                isModified = true; message = nil; preview = nil; persistRecovery(); refreshPreview()
            } catch { message = displayMessage(error) }
        }
    }
    func openURL(_ url: URL) { confirmDiscard { [weak self] in self?.load(url) } }
    private func remember(_ url: URL) {
        guard persistenceEnabled, url != recoveryFileURL else { return }
        recentFiles.removeAll { $0 == url }; recentFiles.insert(url, at: 0)
        recentFiles = Array(recentFiles.prefix(10))
        preferences.set(recentFiles.map(\.path), forKey: "artifactRecentFiles")
        if preferences === UserDefaults.standard { NSDocumentController.shared.noteNewRecentDocumentURL(url) }
    }
    private func persistRecovery() {
        guard persistenceEnabled, let session else { return }
        do {
            let url = recoveryFileURL
            if isModified {
                let drafts: [[String: Any]] = inspectorDrafts.map { id, draft in
                    ["id": id, "values": draft.values, "patch": draft.patch, "valid": draft.valid]
                }
                try ProjectFileService.writeRecovery(activeInspector?.durableJSON ?? session.exportJson(), drafts: drafts, to: url)
                recoveryAvailable = true
            } else {
                try ProjectFileService.clearRecovery(at: url)
                recoveryAvailable = false
            }
        } catch { message = "Could not save recovery draft: " + error.localizedDescription }
    }
    func restoreRecovery() {
        if needsStartupRecoveryChoice { restoreRecoveryNow(); return }
        confirmDiscard { [weak self] in
            self?.restoreRecoveryNow()
        }
    }
    private func restoreRecoveryNow() {
        let source = try? String(contentsOf: recoveryFileURL, encoding: .utf8)
        let drafts = source.map { ProjectFileService.recoveryDrafts(at: recoveryFileURL, matching: $0) } ?? []
        load(recoveryFileURL)
        if currentURL == recoveryFileURL {
            currentURL = nil; fileName = "Recovered.artifact"; savedJSON = ""; isModified = true
            for item in drafts {
                guard let id = item["id"] as? String, let values = item["values"] as? [String: String],
                      let patch = item["patch"] as? [String: Any], let valid = item["valid"] as? Bool else { continue }
                inspectorDrafts[id] = InspectorDraft(values: values, patch: patch, valid: valid)
            }
            if !inspectorDrafts.isEmpty { message = "Unapplied inspector changes were restored. Review them before saving." }
        }
    }
    func save(completion: @escaping (Bool) -> Void = { _ in }) {
        guard let url = currentURL else { saveAs(completion: completion); return }
        completion(save(to: url))
    }
    @discardableResult func save(to url: URL) -> Bool {
        guard let session, applyInspectors() else { return false }
        do {
            let source = try session.exportJson()
            try ProjectFileService.write(source, to: url)
            currentURL = url; savedJSON = source; fileName = url.lastPathComponent
            isModified = false; message = nil; remember(url)
            if persistenceEnabled { try? ProjectFileService.clearRecovery(at: recoveryFileURL); recoveryAvailable = false }
            return true
        } catch { message = displayMessage(error); return false }
    }
    func saveCopy(completion: @escaping (Bool) -> Void = { _ in }) {
        presentProjectSavePanel(copy: true, completion: completion)
    }
    private func saveAs(completion: @escaping (Bool) -> Void) {
        presentProjectSavePanel(copy: false, completion: completion)
    }
    private func presentProjectSavePanel(copy: Bool, completion: @escaping (Bool) -> Void) {
        guard session != nil else { completion(false); return }
        let requestedRevision = filePanelGeneration
        let panel = NSSavePanel()
        panel.allowedContentTypes = [UTType(filenameExtension: "artifact") ?? .json]
        panel.allowsOtherFileTypes = true
        let stem = URL(fileURLWithPath: fileName).deletingPathExtension().lastPathComponent
        panel.nameFieldStringValue = "\(stem)\(copy ? "-copy" : "").artifact"
        presentFilePanel(panel) { [weak self] url in
            guard let self, let url else { completion(false); return }
            guard self.filePanelIsCurrent(requestedRevision) else {
                self.message = "Project changed while Save was open. Choose Save again."
                completion(false)
                return
            }
            if !copy { completion(save(to: url)); return }
            completion(saveCopy(to: url))
        }
    }
    @discardableResult func saveCopy(to url: URL) -> Bool {
        guard let session else { return false }
        do {
            try ProjectFileService.write(activeInspector?.durableJSON ?? session.exportJson(), to: url)
            message = nil
            return true
        } catch { message = displayMessage(error); return false }
    }
}
