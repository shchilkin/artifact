import AppKit
import CoreText
import Foundation

@MainActor private final class PendingLayerFrames {
    var plans: [String] = []
    var requests: [CheckedContinuation<CGImage, Error>] = []
    func render(_ plan: String) async throws -> CGImage {
        plans.append(plan)
        return try await withCheckedThrowingContinuation { requests.append($0) }
    }
}

@main struct LayerInteractionCheck {
    static func check(_ value: @autoclosure () -> Bool, _ message: String) {
        precondition(value(), message)
    }
    @MainActor static func wait(_ condition: () -> Bool) async throws {
        for _ in 0..<500 {
            if condition() { return }
            try await Task.sleep(for: .milliseconds(10))
        }
        fatalError("Timed out waiting for native preview")
    }
    @MainActor static func text(_ model: ProjectModel) -> String {
        model.editor.layers.first { $0.id == "font-title" }?.string("content") ?? ""
    }
    static func packageText(_ source: String) throws -> String {
        let root = try JSONSerialization.jsonObject(with: Data(source.utf8)) as! [String: Any]
        let document = (root["document"] as? [String: Any]) ?? root
        let layers = document["layers"] as! [[String: Any]]
        return layers.first { $0["id"] as? String == "font-title" }?["content"] as? String ?? ""
    }
    static func planText(_ source: String) throws -> String {
        let plan = try JSONSerialization.jsonObject(with: Data(source.utf8)) as! [String: Any]
        let layers = plan["layers"] as! [[String: Any]]
        return layers.first { $0["id"] as? String == "font-title" }?["content"] as? String ?? ""
    }
    static func frame(_ width: Int) -> CGImage {
        CGContext(data: nil, width: width, height: 1, bitsPerComponent: 8, bytesPerRow: width * 4,
            space: CGColorSpaceCreateDeviceRGB(), bitmapInfo: CGImageAlphaInfo.premultipliedLast.rawValue)!.makeImage()!
    }
    @MainActor static func main() async throws {
        guard CommandLine.arguments.count == 3 else { fatalError("layer-interaction-check INPUT OUTPUT-DIRECTORY") }
        let sourceURL = URL(fileURLWithPath: CommandLine.arguments[1])
        let output = URL(fileURLWithPath: CommandLine.arguments[2])
        try FileManager.default.createDirectory(at: output, withIntermediateDirectories: true)
        let baseline = try String(contentsOf: sourceURL, encoding: .utf8)
        let original = try packageText(baseline)
        let pending = PendingLayerFrames()
        let pendingModel = ProjectModel(renderImage: { try await pending.render($0) },
            renderExportData: { _, _, _ in Data() }, persist: false)
        pendingModel.load(sourceURL)
        try await wait { pending.requests.count == 1 }
        let pendingRevision = pendingModel.documentRevision
        let pendingUndo = pendingModel.summary?.canUndo
        pendingModel.stageInspector("font-title", values: ["content": "Queued live draft"],
                                    patch: ["content": "Queued live draft"], valid: true)
        try await wait { pending.requests.count == 2 }
        let originalPlanText = try planText(pending.plans[0])
        let draftPlanText = try planText(pending.plans[1])
        check(originalPlanText == original && draftPlanText == "Queued live draft" &&
              pendingModel.documentRevision == pendingRevision,
              "Render plan did not read transaction draft before durable revision")
        pending.requests[1].resume(returning: frame(22))
        try await wait { pendingModel.preview?.size.width == 22 }
        pending.requests[0].resume(returning: frame(11))
        await Task.yield()
        check(pendingModel.preview?.size.width == 22, "Stale preview replaced newer inspector tick")
        pendingModel.discardInspector("font-title")
        try await wait { pending.requests.count == 3 }
        pending.requests[2].resume(returning: frame(33))
        try await wait { pendingModel.preview?.size.width == 33 }
        check(pendingModel.documentRevision == pendingRevision && pendingModel.summary?.canUndo == pendingUndo &&
              !pendingModel.isModified, "Cancel left a durable edit or history step")
        let transform = ArtworkTransform(EditorLayer(raw: ["id":"geometry", "kind":"image", "x":0.5,
                                                          "y":0.5, "scaleX":0.5, "scaleY":1.0, "rotation":0]))
        let uniform = transform.scaled(CGSize(width: 30, height: 10), canvas: CGSize(width: 500, height: 400), independent: false)
        check(abs(uniform.scaleX / uniform.scaleY - 0.5) < 0.0000001, "Uniform scaling changed image aspect")
        let independent = transform.scaled(CGSize(width: 30, height: 0), canvas: CGSize(width: 500, height: 400), independent: true)
        check(independent.scaleY == 1 && independent.scaleX > 0.5, "Option scaling did not isolate the axis")
        let nudge = transform.nudged(dx: 1, dy: 10, artwork: NativeCanvasDimensions.base("4:5"))
        check(abs(nudge.x - 0.5 - 1.0 / 1080) < 0.0000001 && abs(nudge.y - 0.5 - 10.0 / 1350) < 0.0000001,
              "Arrow nudge did not use canonical artwork pixels")
        let font = CTFontCreateWithName("Courier New" as CFString, 60, nil)
        let inkColor = CGColor(gray: 1, alpha: 1)
        let wrapped = LayerGeometry.textLines("Wrapped text uses the renderer line width", font: font,
                                              color: inkColor, align: "left", width: 240)
        check(wrapped.count > 1 && LayerGeometry.textBounds(wrapped).height > 60,
              "Text hit bounds did not include wrapped lines")
        let compressed = LayerGeometry.textLines("Supercalifragilisticexpialidocious", font: font,
                                                 color: inkColor, align: "right", width: 100)
        check(compressed.count == 1 && compressed[0].horizontalScale < 1,
              "Forced overlong word did not share renderer compression")
        let imageFixture = sourceURL.deletingLastPathComponent().appendingPathComponent("alpha-nonsquare.artifact.json")
        let imageModel = ProjectModel(persist: false)
        imageModel.load(imageFixture)
        try await wait { !imageModel.isRendering }
        let imageLayer = imageModel.editor.layers.first { $0.id == "alpha-image" }!
        check(imageLayer.raw["src"] == nil, "Test requires lightweight editor image state")
        let contained = imageModel.localBounds(for: imageLayer)
        check(abs(contained.width - 800) < 0.1 && abs(contained.height - 800 * 2 / 3) < 0.1,
              "Decoded non-square contain bounds do not match painter")
        check(imageModel.command(["type":"edit_layer","id":"alpha-image","patch":["fit":"cover"]]),
              "Could not switch image fit for geometry test")
        let covered = imageModel.localBounds(for: imageModel.editor.layers[0])
        check(abs(covered.width - 1500) < 0.1 && abs(covered.height - 1000) < 0.1,
              "Decoded non-square cover bounds do not match painter")
        check(imageModel.command(["type":"edit_layer","id":"alpha-image","patch":["fit":"tile"]]),
              "Could not switch image to tile")
        check(imageModel.localBounds(for: imageModel.editor.layers[0]).isNull,
              "Tile image incorrectly exposes movable handles")
        let model = ProjectModel(persist: false)
        model.load(sourceURL)
        try await wait { !model.isRendering }
        check(model.message == nil, "Could not open source")
        let settledPixels = model.preview?.tiffRepresentation
        check(settledPixels != nil, "Initial native preview has no bitmap")
        var stageToBitmapMilliseconds: [Double] = []
        for index in 0..<5 {
            let started = DispatchTime.now().uptimeNanoseconds
            model.stageInspector("font-title", values: ["content": "Native draft frame \(index)"],
                                 patch: ["content": "Native draft frame \(index)"], valid: true)
            let transientRevision = model.documentRevision
            try await wait { !model.isRendering }
            check(model.documentRevision == transientRevision, "Transient render changed durable revision")
            check(model.preview?.tiffRepresentation != settledPixels,
                  "Transaction draft did not change the rendered bitmap")
            stageToBitmapMilliseconds.append(Double(DispatchTime.now().uptimeNanoseconds - started) / 1_000_000)
            model.discardInspector("font-title")
            try await wait { !model.isRendering }
        }
        let sortedTimings = stageToBitmapMilliseconds.sorted()
        let timingReport: [String: Any] = ["stageToBitmapMilliseconds": stageToBitmapMilliseconds,
            "medianMilliseconds": sortedTimings[2], "minMilliseconds": sortedTimings[0],
            "maxMilliseconds": sortedTimings[4], "sampleCount": 5,
            "scope": "model stage call through native preview bitmap completion; excludes display presentation"]
        try JSONSerialization.data(withJSONObject: timingReport, options: [.prettyPrinted, .sortedKeys])
            .write(to: output.appendingPathComponent("stage-to-bitmap.json"))

        let beforeRevision = model.documentRevision
        let beforeUndo = model.summary?.canUndo
        let changed = "Covered By Your Grace wrapped across several lines in Artifact"
        let originalSize = model.editor.layers.first { $0.id == "font-title" }!.number("size")
        model.stageInspector("font-title", values: ["content": changed], patch: ["content": changed], valid: true)
        model.stageInspector("font-title", values: ["content": original], patch: [:], valid: true)
        check(text(model) == original && model.documentRevision == beforeRevision &&
              model.summary?.canUndo == beforeUndo && !model.isModified,
              "Returning to the original value created history or a dirty draft")
        model.stageInspector("font-title", values: ["content": changed], patch: ["content": changed], valid: true)
        model.undo()
        check(text(model) == original && model.documentRevision == beforeRevision &&
              model.summary?.canUndo == beforeUndo && !model.isModified,
              "Undo-as-cancel changed the durable revision or history")
        model.stageInspector("font-title", values: ["content": changed], patch: ["content": changed], valid: true)
        model.stageInspector("font-title", values: ["content": changed, "size": "88"],
                             patch: ["content": changed, "size": 88], valid: true)
        check(text(model) == changed, "Valid inspector tick is not visible in editor state")
        check(model.editor.layers.first { $0.id == "font-title" }!.number("size") == 88,
              "Second live field lost first field")
        check(model.documentRevision == beforeRevision, "Draft advanced durable revision")
        check(model.summary?.canUndo == beforeUndo, "Draft changed durable Undo")
        try await wait { !model.isRendering }
        let copy = output.appendingPathComponent("draft-copy.artifact")
        check(model.saveCopy(to: copy), "Save Copy failed during draft")
        let copiedText = try packageText(String(contentsOf: copy, encoding: .utf8))
        check(copiedText == original,
              "Save Copy included uncommitted inspector changes")
        let title = model.editor.layers.first { $0.id == "font-title" }!
        let bounds = model.localBounds(for: title)
        check(!bounds.isNull && bounds.width > 0 && bounds.height > 0, "Wrapped text has no renderer bounds")
        let width = Int(model.previewDimensions.width), height = Int(model.previewDimensions.height)
        let center = CGPoint(x: title.number("x") * Double(width) + Double(bounds.midX),
                             y: title.number("y") * Double(height) + Double(bounds.midY))
        check(LayerGeometry.contains(center, local: bounds, layer: title.raw, width: width, height: height),
              "Text geometry cannot hit its own ink center")
        model.stageInspector("font-title", values: ["content": changed, "size": "invalid"],
                             patch: ["content": changed], valid: false)
        check(text(model) == original, "Invalid input did not cancel last-valid draft preview")
        check(model.editor.layers.first { $0.id == "font-title" }!.number("size") == originalSize,
              "Invalid field left a prior valid size in the document")
        model.discardInspector("font-title")
        check(model.documentRevision == beforeRevision && !model.isModified, "Cancel changed durable project")

        model.stageInspector("font-title", values: ["content": changed, "size": "88"],
                             patch: ["content": changed, "size": 88], valid: true)
        check(model.applyInspector("font-title"), "Could not commit inspector gesture")
        check(text(model) == changed && model.editor.layers.first { $0.id == "font-title" }!.number("size") == 88,
              "Committed inspector fields disappeared")
        model.undo()
        check(text(model) == original && model.editor.layers.first { $0.id == "font-title" }!.number("size") == originalSize,
              "One Undo did not restore both inspector fields")
        model.redo()
        check(text(model) == changed && model.editor.layers.first { $0.id == "font-title" }!.number("size") == 88,
              "Redo did not restore inspector gesture")

        let recoveryURL = output.appendingPathComponent("inspector-recovery.artifact")
        let preferences = UserDefaults(suiteName: "artifact-p08-" + UUID().uuidString)!
        let recoveryModel = ProjectModel(renderImage: { try await RenderWorker.shared.render(plan: $0) },
            renderExportData: { try await RenderWorker.shared.export(plan: $0, scale: $1, format: $2) },
            persist: true, recoveryURL: recoveryURL, preferences: preferences)
        recoveryModel.load(sourceURL)
        try await wait { !recoveryModel.isRendering }
        recoveryModel.stageInspector("font-title", values: ["content": changed, "size": "88"],
                                     patch: ["content": changed, "size": 88], valid: true)
        let recoveredPackage = try String(contentsOf: recoveryURL, encoding: .utf8)
        let recoveredText = try packageText(recoveredPackage)
        check(recoveredText == original, "Recovery serialized uncommitted text")
        let recoveredDrafts = ProjectFileService.recoveryDrafts(at: recoveryURL, matching: recoveredPackage)
        let recoveryPatch = recoveredDrafts.first?["patch"] as? [String: Any]
        check(recoveredDrafts.count == 1 && recoveryPatch?["content"] as? String == changed
              && (recoveryPatch?["size"] as? Int) == 88,
              "Recovery sidecar omitted one of the live fields")
        recoveryModel.discardInspector("font-title")

        model.selectLayer("font-plate")
        model.selectLayer("font-title", extending: true)
        check(model.selectedIDs.count == 2, "Command selection did not retain both layers")
        model.setSelectionProperties(["opacity": 50])
        check(model.editor.layers.allSatisfy { $0.number("opacity") == 50 }, "Batch patch missed a selected layer")
        model.undo()
        check(model.editor.layers.allSatisfy { $0.number("opacity", 100) == 100 }, "Batch patch was not one Undo")
        let beforeDuplicate = model.editor.layers.count
        model.duplicateSelection()
        check(model.editor.layers.count == beforeDuplicate + 2, "Typed duplicate batch did not copy both selected layers")
        model.undo()
        check(model.editor.layers.count == beforeDuplicate, "Duplicate batch was not one Undo")

        model.selectLayer("font-title")
        let beforeOrder = model.editor.orderedLayers.map(\.id)
        model.moveSelection(-1)
        check(model.editor.orderedLayers.map(\.id) == Array(beforeOrder.reversed()), "Keyboard reorder failed")
        model.undo()
        check(model.editor.orderedLayers.map(\.id) == beforeOrder, "Reorder Undo failed")
        model.reorderSelection(before: "font-plate")
        check(model.editor.orderedLayers.map(\.id) == Array(beforeOrder.reversed()),
              "Drop adapter did not reorder selected layer")
        model.undo()
        check(model.editor.orderedLayers.map(\.id) == beforeOrder, "Drop reorder was not one Undo")
        model.command(["type": "edit_layer", "id": "font-plate", "patch": ["locked": true]])
        model.selectLayer("font-plate")
        model.selectLayer("font-title", extending: true)
        let count = model.editor.layers.count
        model.deleteSelection()
        check(model.editor.layers.count == count, "Locked batch delete was not atomic")
        model.setSelectionProperties(["opacity": 60])
        check(model.editor.layers.allSatisfy { $0.number("opacity") == 60 }, "Locked inspector patch was rejected")

        check(!model.hasGraph, "Stack fixture unexpectedly has a durable graph")
        model.createArea()
        check(model.hasGraph && model.editor.areas.count == 1, "Stack area did not explicitly bootstrap graph")
        model.undo()
        check(!model.hasGraph && model.editor.areas.isEmpty, "One Undo did not restore graph absence")
        let stackAfterUndo = output.appendingPathComponent("stack-after-area-undo.artifact")
        check(model.saveCopy(to: stackAfterUndo), "Could not inspect stack after area Undo")
        let undoneRoot = try JSONSerialization.jsonObject(with: Data(contentsOf: stackAfterUndo)) as! [String: Any]
        let undoneDocument = undoneRoot["document"] as? [String: Any] ?? undoneRoot
        check(undoneDocument["graph"] == nil, "Area Undo serialized an inferred graph")

        var graphRoot = try JSONSerialization.jsonObject(with: Data(baseline.utf8)) as! [String: Any]
        var graphDocument = (graphRoot["document"] as? [String: Any]) ?? graphRoot
        graphDocument["graph"] = ["edges": [
            ["id":"e-font-plate-font-title","fromId":"font-plate","fromPort":"out","toId":"font-title","toPort":"bg"],
            ["id":"e-font-title-__export__","fromId":"font-title","fromPort":"out","toId":"__export__","toPort":"in"]
        ], "positions": [:], "mergeNodes": [], "colorNodes": []] as [String: Any]
        graphRoot = graphRoot["document"] == nil ? graphDocument : graphRoot.merging(["document": graphDocument]) { _, new in new }
        let graphURL = output.appendingPathComponent("graph.artifact")
        try JSONSerialization.data(withJSONObject: graphRoot).write(to: graphURL)
        model.load(graphURL)
        try await wait { !model.isRendering }
        model.selectLayer("font-plate")
        model.selectLayer("font-title", extending: true)
        model.createArea()
        check(model.editor.areas.count == 1 && model.editor.areas[0].nodeIDs.count == 2, "Area creation lost membership")
        let area = model.editor.areas[0]
        model.setAreaCollapsed(area.id, true)
        check(model.editor.areas[0].collapsed, "Area collapse was not stored")
        model.undo()
        check(!model.editor.areas[0].collapsed, "Area collapse Undo failed")
        print("Native layer interaction model and geometry checks passed")
    }
}
