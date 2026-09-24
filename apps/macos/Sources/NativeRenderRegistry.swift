import Foundation

// Each source, effect family and graph utility can register from its own file.
// Modules receive a validated transient layer plan and the current raster target.
// Graph traversal and dependency ordering remain shared-core responsibilities.
struct NativeRenderModule {
    let name: String
    let accepts: ([String: Any]) -> Bool
    let paint: (NativeRasterTarget, [String: Any]) throws -> Void
}

final class NativeRenderRegistry {
    private var sources: [String: NativeRenderModule] = [:]
    private var effects: [NativeRenderModule] = []
    private var graph: [String: NativeRenderModule] = [:]

    func registerSource(_ kind: String, module: NativeRenderModule) { sources[kind] = module }
    // The first accepting module owns the entire effect layer. A family module
    // must accept only plans whose every active parameter it implements; mixed
    // families need ordered composition before P12-P15 register together.
    func registerEffect(_ module: NativeRenderModule) { effects.insert(module, at: 0) }
    func registerGraph(_ kind: String, module: NativeRenderModule) { graph[kind] = module }

    func paint(_ layer: [String: Any], on target: NativeRasterTarget) throws {
        let kind = layer["kind"] as? String ?? ""
        let module: NativeRenderModule?
        if kind == "effect" { module = effects.first { $0.accepts(layer) } }
        else { module = sources[kind] ?? graph[kind] }
        guard let module else { throw RenderFailure(message: "Unsupported native render layer: \(kind)") }
        try module.paint(target, layer)
    }

    static func pilot() -> NativeRenderRegistry {
        let registry = NativeRenderRegistry()
        registry.registerSource("fill", module: NativeFillModule.module)
        registry.registerSource("text", module: NativeRenderModule(name: "text", accepts: { _ in true }, paint: { try $0.paintText($1) }))
        registry.registerSource("image", module: NativeRenderModule(name: "image", accepts: { _ in true }, paint: { try $0.paintImage($1) }))
        registry.registerSource("emoji", module: NativeRenderModule(name: "emoji", accepts: { _ in true }, paint: { try $0.paintEmoji($1) }))
        registry.registerEffect(NativePilotEffectModule.module)
        return registry
    }
}
