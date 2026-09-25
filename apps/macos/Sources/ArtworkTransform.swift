import CoreGraphics
import Foundation

struct ArtworkTransform {
    var x: Double
    var y: Double
    var scaleX: Double
    var scaleY: Double
    var rotation: Double

    init(_ layer: EditorLayer) {
        x = layer.number("x", 0.5); y = layer.number("y", 0.5)
        scaleX = layer.number("scaleX", 1); scaleY = layer.number("scaleY", 1)
        rotation = layer.number("rotation")
    }
    var patch: [String: Double] { ["x": x, "y": y, "scaleX": scaleX, "scaleY": scaleY, "rotation": rotation] }
    func moved(_ distance: CGSize, canvas: CGSize) -> Self {
        var next = self
        next.x = min(3, max(-2, x + Double(distance.width / canvas.width)))
        next.y = min(3, max(-2, y + Double(distance.height / canvas.height)))
        return next
    }
    func nudged(dx: Double, dy: Double, artwork: NativeCanvasDimensions) -> Self {
        moved(CGSize(width: dx, height: dy),
              canvas: CGSize(width: CGFloat(artwork.width), height: CGFloat(artwork.height)))
    }
    func scaled(_ distance: CGSize, canvas: CGSize, independent: Bool) -> Self {
        var next = self
        let dx = Double(distance.width / canvas.width), dy = Double(distance.height / canvas.height)
        if independent {
            next.scaleX = min(10, max(0.05, scaleX + 2 * dx))
            next.scaleY = min(10, max(0.05, scaleY + 2 * dy))
        } else {
            let change = (dx + dy) / sqrt(2.0) * 2
            let factor = min(min(10 / scaleX, 10 / scaleY), max(max(0.05 / scaleX, 0.05 / scaleY), 1 + change))
            next.scaleX = scaleX * factor
            next.scaleY = scaleY * factor
        }
        return next
    }
    func rotated(_ degrees: Double) -> Self {
        var next = self
        next.rotation = min(360, max(-360, rotation + degrees))
        return next
    }
}
