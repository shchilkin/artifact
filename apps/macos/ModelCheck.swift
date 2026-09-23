import AppKit
import Foundation

@MainActor final class Pending<T> {
    var plans: [String] = []
    var requests: [CheckedContinuation<T, Error>] = []
    func run(_ plan: String) async throws -> T {
        plans.append(plan)
        return try await withCheckedThrowingContinuation { requests.append($0) }
    }
}

@main struct ModelCheck {
    @MainActor static func wait(_ condition: () -> Bool) async throws {
        for _ in 0..<500 {
            if condition() { return }
            try await Task.sleep(for: .milliseconds(10))
        }
        fatalError("Timed out waiting for model state")
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
        // Exercise the real renderer and export path, not just scheduling stubs.
        let real = ProjectModel()
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
        print("PASS: native 1000px preview, 3000px independent export, stale preview/export rejection, edit/open cancellation, failure and retry")
    }
}
