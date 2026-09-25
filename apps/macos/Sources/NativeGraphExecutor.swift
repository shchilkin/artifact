import CoreGraphics
import Foundation

// Render-session storage only. Entries are immutable pixel results keyed by the
// shared core's transitive pixel signature, never by a document revision.
final class NativeGraphRenderCache {
    private var entries: [String: CGImage] = [:]
    private var order: [String] = []
    private var cost = 0
    private let limit = 128 * 1024 * 1024
    private(set) var hitCount = 0
    var entryCount: Int { entries.count }

    func image(for key: String) -> CGImage? {
        guard let image = entries[key] else { return nil }
        hitCount += 1
        order.removeAll { $0 == key }; order.append(key)
        return image
    }

    func insert(_ image: CGImage, for key: String) {
        let bytes = image.bytesPerRow * image.height
        guard bytes <= limit else { return }
        if let old = entries.removeValue(forKey: key) {
            cost -= old.bytesPerRow * old.height
            order.removeAll { $0 == key }
        }
        while cost + bytes > limit, let oldest = order.first {
            order.removeFirst()
            if let old = entries.removeValue(forKey: oldest) { cost -= old.bytesPerRow * old.height }
        }
        entries[key] = image; order.append(key); cost += bytes
    }
}

final class NativeGraphExecutor {
    private let resources: NativeRenderResources
    private let cache: NativeGraphRenderCache
    private let registry: NativeRenderRegistry
    private(set) var lastPeakLiveImageBytes = 0

    init(resources: NativeRenderResources, cache: NativeGraphRenderCache = NativeGraphRenderCache(),
         registry: NativeRenderRegistry = .pilot()) {
        self.resources = resources; self.cache = cache; self.registry = registry
    }

    func render(_ plan: NativeRenderPlan) throws -> CGImage {
        lastPeakLiveImageBytes = 0
        guard plan.mode == "graph" else {
            return try PilotRenderer(plan: plan, resources: resources, registry: registry).render()
        }
        let byId = Dictionary(uniqueKeysWithValues: plan.nodes.map { ($0.id, $0) })
        var needed = Set<String>()
        var cachedImages: [String: CGImage] = [:]
        func collect(_ id: String) throws {
            guard needed.insert(id).inserted else { return }
            guard let node = byId[id] else { throw RenderFailure(message: "Missing graph dependency: \(id)") }
            if let image = cache.image(for: node.cacheKey) {
                cachedImages[id] = image
                return
            }
            for input in node.inputs { try collect(input.sourceId) }
        }
        try collect(plan.targetId)
        var remainingUses: [String: Int] = [:]
        for node in plan.nodes where needed.contains(node.id) && cachedImages[node.id] == nil {
            for input in node.inputs { remainingUses[input.sourceId, default: 0] += 1 }
        }
        var rendered: [String: CGImage] = [:]
        for node in plan.nodes where needed.contains(node.id) {
            try Task.checkCancellation()
            if let cached = cachedImages[node.id] {
                rendered[node.id] = cached
                lastPeakLiveImageBytes = max(lastPeakLiveImageBytes,
                    rendered.values.reduce(0) { $0 + $1.bytesPerRow * $1.height })
                continue
            }
            func input(_ port: String) -> CGImage? {
                guard let source = node.inputs.first(where: { $0.port == port })?.sourceId else { return nil }
                return rendered[source]
            }
            let result: CGImage
            switch node.kind {
            case "export": result = try NativeGraphUtilities.copy(input("in"), plan: plan)
            case "merge": result = try NativeGraphUtilities.merge(input("a"), input("b"), node.config, plan: plan)
            case "color": result = try NativeGraphUtilities.color(input("in"), node.config, plan: plan)
            case "repeat": result = try NativeGraphUtilities.repeatNode(input("in"), input("bg"), node.config, plan: plan)
            case "mask": result = try NativeGraphUtilities.mask(input("in"), input("mask"), node.config, plan: plan)
            case "transform": result = try NativeGraphUtilities.transform(input("in"), node.config, plan: plan)
            case "grimeShadow": result = try NativeGraphUtilities.grimeShadow(input("in"), node.config, plan: plan)
            case "fill", "text", "image", "emoji", "effect":
                let base = input(node.kind == "effect" ? "in" : "bg")
                result = try PilotRenderer(plan: plan.singleLayer(node.config), resources: resources,
                                           registry: registry, initialImage: base).render()
            default:
                throw RenderFailure(message: "Unsupported native graph capability: \(node.kind)")
            }
            try Task.checkCancellation()
            rendered[node.id] = result
            lastPeakLiveImageBytes = max(lastPeakLiveImageBytes,
                rendered.values.reduce(0) { $0 + $1.bytesPerRow * $1.height })
            cache.insert(result, for: node.cacheKey)
            for input in node.inputs {
                let count = (remainingUses[input.sourceId] ?? 0) - 1
                remainingUses[input.sourceId] = count
                if count == 0 && input.sourceId != plan.targetId { rendered.removeValue(forKey: input.sourceId) }
            }
        }
        guard let image = rendered[plan.targetId] else {
            throw RenderFailure(message: "Graph render target was not produced")
        }
        return image
    }
}
