import AppKit
import Foundation

@MainActor final class Pending<T> {
    var plans: [String] = []
    var requests: [CheckedContinuation<T, Error>] = []
    var completions = 0
    func run(_ plan: String) async throws -> T {
        plans.append(plan)
        let result = try await withCheckedThrowingContinuation { requests.append($0) }
        completions += 1
        return result
    }
}

@main struct ModelCheck {
    @MainActor static func wait(_ condition: () -> Bool, line: UInt = #line) async throws {
        for _ in 0..<500 {
            if condition() { return }
            try await Task.sleep(for: .milliseconds(10))
        }
        fatalError("Timed out waiting for model state at line \(line)")
    }
    static func check(_ condition: @autoclosure () throws -> Bool, _ message: String = "Model check failed") throws {
        let result = try condition()
        precondition(result, message)
    }
    static func image(_ width: Int) -> CGImage {
        CGContext(data: nil, width: width, height: 1, bitsPerComponent: 8, bytesPerRow: width * 4,
            space: CGColorSpaceCreateDeviceRGB(), bitmapInfo: CGImageAlphaInfo.premultipliedLast.rawValue)!.makeImage()!
    }
    static func size(_ plan: String) throws -> Int {
        (try JSONSerialization.jsonObject(with: Data(plan.utf8)) as! [String: Any])["width"] as! Int
    }
    @MainActor static func main() async throws {
        guard CommandLine.arguments.count == 3 else { fatalError("model-check INPUT OUTPUT-DIRECTORY") }
        let source = URL(fileURLWithPath: CommandLine.arguments[1])
        let directory = URL(fileURLWithPath: CommandLine.arguments[2])
        try FileManager.default.createDirectory(at: directory, withIntermediateDirectories: true)
        let previews = Pending<CGImage>(), exports = Pending<Data>()
        let model = ProjectModel(renderImage: { try await previews.run($0) }, renderPNGData: { try await exports.run($0) })
        model.load(source)
        try await wait { previews.requests.count == 1 }
        try check(try size(previews.plans[0]) == 1000)
        model.editScanlines(42)
        try await wait { previews.requests.count == 2 }
        previews.requests[1].resume(returning: image(22))
        try await wait { !model.isRendering }
        previews.requests[0].resume(returning: image(11))
        await Task.yield()
        try check(model.preview?.size.width == 22, "Old preview replaced new revision")
        let cancelled = directory.appendingPathComponent("cancelled-export.png")
        try Data("existing destination".utf8).write(to: cancelled)
        model.exportPNG(to: cancelled)
        try await wait { exports.requests.count == 1 }
        try check(try size(exports.plans[0]) == 3000)
        model.editScanlines(43)
        try await wait { previews.requests.count == 3 }
        exports.requests[0].resume(returning: Data("stale PNG".utf8))
        previews.requests[2].resume(returning: image(33))
        try await wait { !model.isRendering }
        try check(try Data(contentsOf: cancelled) == Data("existing destination".utf8), "Stale export overwrote destination")
        try check(!model.isExporting)
        let final = directory.appendingPathComponent("model-export.bin")
        model.exportPNG(to: final)
        try await wait { exports.requests.count == 2 }
        exports.requests[1].resume(throwing: RenderFailure(message: "Test encode failure"))
        try await wait { !model.isExporting }
        try check(model.exportMessage == "Test encode failure")
        model.exportPNG(to: final)
        try await wait { exports.requests.count == 3 }
        exports.requests[2].resume(returning: Data("current PNG".utf8))
        try await wait { !model.isExporting }
        try check(try Data(contentsOf: final) == Data("current PNG".utf8))
        try check(model.exportMessage == nil)
        // A project replacement invalidates pending exports as well as edits.
        model.exportPNG(to: final)
        try await wait { exports.requests.count == 4 }
        model.load(source)
        try await wait { previews.requests.count == 4 }
        exports.requests[3].resume(returning: Data("previous project".utf8))
        previews.requests[3].resume(returning: image(44))
        try await wait { !model.isRendering }
        try check(try Data(contentsOf: final) == Data("current PNG".utf8))
        // A no-op pointer commit must settle a displayed or pending draft to
        // full quality without changing the document revision or dirty state.
        let draftPreviews = Pending<CGImage>()
        let draftModel = ProjectModel(renderImage: { try await draftPreviews.run($0) }, renderPNGData: { _ in Data() })
        draftModel.load(source)
        draftModel.selectedID = draftModel.summary?.layers.first(where: { $0.kind == "text" })?.id
        try check(draftModel.selectedID != nil)
        try await wait { draftPreviews.requests.count == 1 }
        draftPreviews.requests[0].resume(returning: image(1000))
        try await wait { draftModel.preview?.size.width == 1000 }
        let unchangedRevision = draftModel.documentRevision
        draftModel.previewTransform(["x": 0.5])
        try await wait { draftPreviews.requests.count == 2 }
        try check(try size(draftPreviews.plans[1]) == 500)
        draftPreviews.requests[1].resume(returning: image(500))
        try await wait { draftModel.preview?.size.width == 500 }
        draftModel.editProperties(["x": 0.5])
        try await wait { draftPreviews.requests.count == 3 }
        try check(try size(draftPreviews.plans[2]) == 1000)
        draftPreviews.requests[2].resume(returning: image(1000))
        try await wait { draftModel.preview?.size.width == 1000 && !draftModel.isRendering }
        try check(draftModel.documentRevision == unchangedRevision && !draftModel.isModified)
        draftModel.previewTransform(["x": 0.5])
        try await wait { draftPreviews.requests.count == 4 }
        draftModel.editProperties(["x": 0.5])
        try await wait { draftPreviews.requests.count == 5 }
        draftPreviews.requests[4].resume(returning: image(1000))
        try await wait { draftModel.preview?.size.width == 1000 && !draftModel.isRendering }
        draftPreviews.requests[3].resume(returning: image(500))
        try await wait { draftPreviews.completions == 5 }
        try check(draftModel.preview?.size.width == 1000, "Late no-op draft replaced the full preview")
        try check(draftModel.documentRevision == unchangedRevision && !draftModel.isModified)
        // Exercise the real renderer and export path, not just scheduling stubs.
        let real = ProjectModel(persist: false)
        real.load(source)
        try await wait { !real.isRendering }
        try check(real.preview?.size.width == 1000 && real.renderMessage == nil)
        let png = directory.appendingPathComponent("model-real-export.png")
        real.exportPNG(to: png)
        try await wait { !real.isExporting }
        try check(real.exportMessage == nil)
        let data = try Data(contentsOf: png)
        try check(data.prefix(8) == Data([137,80,78,71,13,10,26,10]))
        try check(data[16..<20] == Data([0,0,11,184])) // 3000
        // Coherent editing and file lifecycle on a new native document.
        let workspace = ProjectModel(persist: false)
        workspace.newDocument()
        workspace.addLayer("fill")
        workspace.editProperties(["color":"#14232e"])
        workspace.addLayer("text")
        workspace.editProperties(["content":"NATIVE STUDIO","color":"#ff6b35","size":48])
        let title = workspace.selectedID!
        workspace.duplicate()
        workspace.editProperties(["content":"SIDE B","y":0.8,"size":24])
        let copy = workspace.selectedID!
        workspace.deleteSelected()
        try check(workspace.editor.layers.count == 2)
        workspace.undo()
        try check(workspace.editor.layers.count == 3)
        workspace.selectedID = copy
        workspace.moveSelected(-1)
        try check(workspace.message == nil)
        workspace.command(["type":"move_node","id":title,"x":420,"y":140])
        workspace.command(["type":"connect","from":title,"to":"__export__"])
        try await wait { !workspace.isRendering }
        try check(workspace.renderMessage == nil && workspace.preview != nil)
        let saved = directory.appendingPathComponent("native-workspace.artifact")
        workspace.stageInspector(title, values: ["content":"PENDING TITLE"], patch: ["content":"PENDING TITLE"], valid: true)
        workspace.selectedID = copy
        workspace.editProperties(["visible": false])
        try check(workspace.inspectorDrafts[title]?.values["content"] == "PENDING TITLE")
        try check(workspace.save(to:saved))
        try check(!workspace.isModified && workspace.inspectorDrafts.isEmpty)
        try check(workspace.editor.layers.first { $0.id == title }?.string("content") == "PENDING TITLE")
        let savedBytes = try Data(contentsOf:saved)
        workspace.stageInspector(title, values: ["size":"invalid"], patch: [:], valid: false)
        try check(!workspace.save(to:saved), "Invalid inspector draft was silently saved")
        let unchangedBytes = try Data(contentsOf:saved)
        try check(unchangedBytes == savedBytes && workspace.inspectorDrafts[title] != nil)
        workspace.discardInspector(title)
        try check(!workspace.isModified)
        workspace.selectedID = title
        workspace.editProperties(["content":"Changed"])
        try check(workspace.isModified)
        workspace.undo()
        try check(!workspace.isModified, "Undo to saved document remained dirty")
        let reopened = ProjectModel(persist:false)
        reopened.load(saved)
        try check(reopened.editor.layers.count == 3 && reopened.message == nil)
        try await wait { !reopened.isRendering }
        reopened.exportPNG(to:directory.appendingPathComponent("native-workspace.png"))
        try await wait { !reopened.isExporting }
        try check(reopened.exportMessage == nil)
        print("PASS: native new/add/edit/duplicate/delete/reorder/graph/save/reopen/export and saved-state history")
        print("PASS: native 1000px preview, 3000px independent export, stale preview/export rejection, edit/open cancellation, failure and retry")
        print("PASS: no-op pointer commit settles displayed and late 500px drafts without dirtying the document")
    }
}
