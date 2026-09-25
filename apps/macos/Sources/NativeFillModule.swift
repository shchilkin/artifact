import Foundation

enum NativeFillModule {
    static let module = NativeRenderModule(name: "fill", accepts: { _ in true }) { target, layer in
        target.context.setFillColor(try target.color(layer["color"] as? String ?? "#000000"))
        target.context.fill(CGRect(x: 0, y: 0, width: target.width, height: target.height))
    }
}
