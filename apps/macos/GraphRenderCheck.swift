import Foundation
import CoreGraphics

@main struct GraphRenderCheck {
    static func document(_ path: String) throws -> [String: Any] {
        guard let value = try JSONSerialization.jsonObject(with: Data(contentsOf: URL(fileURLWithPath: path))) as? [String: Any] else {
            throw RenderFailure(message: "Invalid graph check document")
        }
        return value
    }
    static func plan(_ document: [String: Any], width: UInt32, height: UInt32, target: String = "__export__") throws -> NativeRenderPlan {
        let package: [String: Any] = ["artifactPackage": "project",
            "manifest": ["kind":"artifact-project-package","version":1,"documentSchemaVersion":3],
            "document": document]
        let data = try JSONSerialization.data(withJSONObject: package)
        let session = try NativeSession.open(source: String(decoding: data, as: UTF8.self))
        return try NativeRenderPlan(json: session.renderTargetPlanJson(width: width, height: height, targetId: target))
    }
    static func require(_ condition: Bool, _ message: String) throws {
        if !condition { throw RenderFailure(message: message) }
    }
    static func main() async throws {
        let args = CommandLine.arguments
        guard args.count == 3 else { fatalError("graph-render-check BRANCH_FIXTURE HUNDRED_NODE_FIXTURE") }
        let branch = try document(args[1])
        let resources = NativeRenderResources(), cache = NativeGraphRenderCache()
        let executor = NativeGraphExecutor(resources: resources, cache: cache)
        let original = try plan(branch, width: 1920, height: 1080)
        let first = try executor.render(original)
        let hitsAfterFirst = cache.hitCount
        let second = try executor.render(original)
        try require(cache.hitCount > hitsAfterFirst, "Repeated export did not reuse graph cache")
        try require(PilotRenderer.pngData(first) == PilotRenderer.pngData(second), "Repeated export changed pixels")
        let repeatTarget = try plan(branch, width: 1920, height: 1080, target: "branch-repeat")
        _ = try executor.render(repeatTarget)
        let hitsAfterTarget = cache.hitCount
        try require(hitsAfterTarget > hitsAfterFirst + 1, "Node target did not reuse shared branch cache")

        var changed = branch
        var graph = changed["graph"] as! [String: Any]
        var repeatNodes = graph["repeatNodes"] as! [[String: Any]]
        repeatNodes[0]["count"] = 2; graph["repeatNodes"] = repeatNodes; changed["graph"] = graph
        let changedPlan = try plan(changed, width: 1920, height: 1080)
        let hitsBeforeChange = cache.hitCount
        let changedImage = try executor.render(changedPlan)
        try require(cache.hitCount >= hitsBeforeChange + 2, "Unchanged branches were not reused")
        try require(PilotRenderer.pngData(changedImage) != PilotRenderer.pngData(first), "Changed branch reused stale pixels")

        let hundred = try document(args[2])
        let stress = try plan(hundred, width: 281, height: 500)
        let stressExecutor = NativeGraphExecutor(resources: NativeRenderResources())
        _ = try stressExecutor.render(stress)
        let frameBytes = 281 * 500 * 4
        try require(stressExecutor.lastPeakLiveImageBytes <= frameBytes * 3,
                    "Intermediate graph images grew beyond the live frontier")

        let canceled = Task {
            withUnsafeCurrentTask { $0?.cancel() }
            return try NativeGraphExecutor(resources: NativeRenderResources()).render(original)
        }
        switch await canceled.result {
        case .success: throw RenderFailure(message: "Canceled graph render presented a frame")
        case .failure(let error): try require(error is CancellationError, "Cancellation returned the wrong error")
        }
        print("Native graph cache reuse/invalidation, node target, 100-node live frontier and cancellation passed; peak live bytes \(stressExecutor.lastPeakLiveImageBytes)")
    }
}
