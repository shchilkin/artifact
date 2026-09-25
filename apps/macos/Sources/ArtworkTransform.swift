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

    // Bounds are in renderer pixels; drag translations and handle positions are in view points.
    // The north-west corner is fixed while the south-east handle is dragged.
    func scaleFactorsForHandle(_ translation: CGSize, bounds: CGRect, canvas: CGSize,
                               artwork: CGSize, independent: Bool) -> (x: Double, y: Double)? {
        guard bounds.width > 0, bounds.height > 0, canvas.width > 0, canvas.height > 0,
              artwork.width > 0, artwork.height > 0 else { return nil }
        let opposite = point(CGPoint(x: bounds.minX, y: bounds.minY), canvas: canvas, artwork: artwork)
        let corner = point(CGPoint(x: bounds.maxX, y: bounds.maxY), canvas: canvas, artwork: artwork)
        let target = CGPoint(x: corner.x + translation.width, y: corner.y + translation.height)
        let angle = rotation * .pi / 180
        let dx = Double(target.x - opposite.x), dy = Double(target.y - opposite.y)
        let projectedX = dx * cos(angle) + dy * sin(angle)
        let projectedY = -dx * sin(angle) + dy * cos(angle)
        let originalX = Double(bounds.width * canvas.width / artwork.width) * scaleX
        let originalY = Double(bounds.height * canvas.height / artwork.height) * scaleY
        guard originalX > 0, originalY > 0 else { return nil }
        if independent { return (projectedX / originalX, projectedY / originalY) }
        let factor = (projectedX * originalX + projectedY * originalY) /
            (originalX * originalX + originalY * originalY)
        return (factor, factor)
    }

    func scaledAroundOppositeCorner(_ factors: (x: Double, y: Double), bounds: CGRect,
                                    canvas: CGSize, artwork: CGSize, independent: Bool) -> Self {
        let fixed = point(CGPoint(x: bounds.minX, y: bounds.minY), canvas: canvas, artwork: artwork)
        var next = self
        if independent {
            next.scaleX = min(10, max(0.05, scaleX * factors.x))
            next.scaleY = min(10, max(0.05, scaleY * factors.y))
        } else {
            let factor = min(min(10 / scaleX, 10 / scaleY),
                             max(max(0.05 / scaleX, 0.05 / scaleY), factors.x))
            next.scaleX = scaleX * factor
            next.scaleY = scaleY * factor
        }
        next.place(CGPoint(x: bounds.minX, y: bounds.minY), at: fixed, canvas: canvas, artwork: artwork)
        return next
    }

    func rotationDeltaForHandle(_ translation: CGSize, bounds: CGRect, canvas: CGSize,
                                artwork: CGSize) -> Double? {
        guard !bounds.isNull, !bounds.isEmpty, canvas.width > 0, canvas.height > 0 else { return nil }
        let center = point(CGPoint(x: bounds.midX, y: bounds.midY), canvas: canvas, artwork: artwork)
        let top = point(CGPoint(x: bounds.midX, y: bounds.minY), canvas: canvas, artwork: artwork)
        let angle = rotation * .pi / 180
        let handle = CGPoint(x: top.x + 22 * sin(angle), y: top.y - 22 * cos(angle))
        let start = atan2(Double(handle.y - center.y), Double(handle.x - center.x))
        let end = atan2(Double(handle.y + translation.height - center.y),
                        Double(handle.x + translation.width - center.x))
        var delta = (end - start) * 180 / .pi
        if delta > 180 { delta -= 360 }
        if delta < -180 { delta += 360 }
        return delta
    }

    func rotatedAroundBoundsCenter(_ degrees: Double, bounds: CGRect, canvas: CGSize,
                                   artwork: CGSize, snap: Bool) -> Self {
        let fixed = point(CGPoint(x: bounds.midX, y: bounds.midY), canvas: canvas, artwork: artwork)
        var next = rotated(degrees)
        if snap { next.rotation = (next.rotation / 15).rounded() * 15 }
        next.place(CGPoint(x: bounds.midX, y: bounds.midY), at: fixed, canvas: canvas, artwork: artwork)
        return next
    }

    func point(_ local: CGPoint, canvas: CGSize, artwork: CGSize) -> CGPoint {
        let angle = rotation * .pi / 180
        let localX = Double(local.x) * scaleX, localY = Double(local.y) * scaleY
        let rasterX = x * Double(artwork.width) + localX * cos(angle) - localY * sin(angle)
        let rasterY = y * Double(artwork.height) + localX * sin(angle) + localY * cos(angle)
        return CGPoint(x: rasterX * Double(canvas.width / artwork.width),
                       y: rasterY * Double(canvas.height / artwork.height))
    }

    private mutating func place(_ local: CGPoint, at fixed: CGPoint, canvas: CGSize, artwork: CGSize) {
        let angle = rotation * .pi / 180
        let localX = Double(local.x) * scaleX, localY = Double(local.y) * scaleY
        let rasterX = Double(fixed.x * artwork.width / canvas.width)
        let rasterY = Double(fixed.y * artwork.height / canvas.height)
        x = (rasterX - localX * cos(angle) + localY * sin(angle)) / Double(artwork.width)
        y = (rasterY - localX * sin(angle) - localY * cos(angle)) / Double(artwork.height)
    }
}
