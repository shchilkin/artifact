import CoreGraphics
import Foundation

enum NativeGraphUtilities {
    private final class Canvas {
        let width: Int
        let height: Int
        let context: CGContext
        init(_ width: Int, _ height: Int) throws {
            guard let space = CGColorSpace(name: CGColorSpace.sRGB),
                  let context = CGContext(data: nil, width: width, height: height, bitsPerComponent: 8,
                      bytesPerRow: width * 4, space: space,
                      bitmapInfo: CGBitmapInfo.byteOrder32Big.rawValue | CGImageAlphaInfo.premultipliedLast.rawValue)
            else { throw RenderFailure(message: "Cannot create graph raster") }
            self.width = width; self.height = height; self.context = context
            context.translateBy(x: 0, y: CGFloat(height)); context.scaleBy(x: 1, y: -1)
            context.interpolationQuality = .high
        }
        func draw(_ image: CGImage?, in rect: CGRect? = nil) {
            guard let image else { return }
            let rect = rect ?? CGRect(x: 0, y: 0, width: width, height: height)
            context.saveGState()
            context.translateBy(x: 0, y: rect.minY * 2 + rect.height)
            context.scaleBy(x: 1, y: -1)
            context.draw(image, in: rect)
            context.restoreGState()
        }
        func image() throws -> CGImage {
            guard let image = context.makeImage() else { throw RenderFailure(message: "Cannot finish graph raster") }
            return image
        }
        func bytes() throws -> UnsafeMutableBufferPointer<UInt8> {
            guard let data = context.data else { throw RenderFailure(message: "Missing graph pixels") }
            return UnsafeMutableBufferPointer(start: data.assumingMemoryBound(to: UInt8.self), count: width * height * 4)
        }
    }

    private static func n(_ node: [String: Any], _ key: String, _ fallback: Double = 0) -> Double {
        (node[key] as? NSNumber)?.doubleValue ?? fallback
    }
    private static func int(_ node: [String: Any], _ key: String, _ fallback: Int) -> Int {
        Int(n(node, key, Double(fallback)).rounded())
    }
    private static func byte(_ value: Double) -> UInt8 {
        UInt8(max(0, min(255, value.rounded())))
    }
    private static func blend(_ value: String) throws -> CGBlendMode {
        switch value {
        case "source-over", "normal": return .normal
        case "multiply": return .multiply
        case "screen": return .screen
        case "overlay": return .overlay
        case "darken": return .darken
        case "lighten": return .lighten
        case "color-dodge": return .colorDodge
        case "color-burn": return .colorBurn
        case "hard-light": return .hardLight
        case "soft-light": return .softLight
        case "difference": return .difference
        case "exclusion": return .exclusion
        case "hue": return .hue
        case "saturation": return .saturation
        case "color": return .color
        case "luminosity": return .luminosity
        default: throw RenderFailure(message: "Unsupported graph blend mode: \(value)")
        }
    }
    private static func rgb(_ hex: String) throws -> (UInt8, UInt8, UInt8) {
        guard hex.count == 7, hex.first == "#", let value = UInt32(hex.dropFirst(), radix: 16) else {
            throw RenderFailure(message: "Unsupported graph color")
        }
        return (UInt8((value >> 16) & 255), UInt8((value >> 8) & 255), UInt8(value & 255))
    }
    private static func alphaBounds(_ image: CGImage, threshold: UInt8) throws -> CGRect? {
        let c = try Canvas(image.width, image.height); c.draw(image)
        let data = try c.bytes()
        var minX = image.width, minY = image.height, maxX = -1, maxY = -1
        for y in 0..<image.height {
            for x in 0..<image.width where data[(y * image.width + x) * 4 + 3] > threshold {
                minX = min(minX, x); minY = min(minY, y)
                maxX = max(maxX, x); maxY = max(maxY, y)
            }
        }
        guard maxX >= minX else { return nil }
        return CGRect(x: minX, y: minY, width: maxX - minX + 1, height: maxY - minY + 1)
    }
    private static func visibleThreshold(_ image: CGImage) throws -> UInt8 {
        let c = try Canvas(image.width, image.height); c.draw(image)
        let data = try c.bytes()
        var maximum: UInt8 = 0
        for i in stride(from: 3, to: data.count, by: 4) { maximum = max(maximum, data[i]) }
        return byte(min(24, max(8, Double(maximum) * 0.08)))
    }

    static func copy(_ source: CGImage?, plan: NativeRenderPlan) throws -> CGImage {
        let c = try Canvas(plan.width, plan.height); c.draw(source); return try c.image()
    }
    static func merge(_ a: CGImage?, _ b: CGImage?, _ node: [String: Any], plan: NativeRenderPlan) throws -> CGImage {
        let c = try Canvas(plan.width, plan.height); c.draw(a)
        if let b {
            c.context.saveGState()
            c.context.setBlendMode(try blend(node["blendMode"] as? String ?? "source-over"))
            c.context.setAlpha(n(node, "opacity", 100) / 100)
            c.draw(b)
            c.context.restoreGState()
        }
        return try c.image()
    }
    static func color(_ source: CGImage?, _ node: [String: Any], plan: NativeRenderPlan) throws -> CGImage {
        let c = try Canvas(plan.width, plan.height); c.draw(source)
        let contrast = n(node, "contrast", 100), brightness = n(node, "brightness", 100)
        let saturation = n(node, "saturation", 100), hue = n(node, "hue")
        if contrast == 100 && brightness == 100 && saturation == 100 && hue == 0 { return try c.image() }
        let theta = hue * .pi / 180, cosine = cos(theta), sine = sin(theta)
        let hm: [[Double]] = [
            [0.213 + cosine * 0.787 - sine * 0.213, 0.715 - cosine * 0.715 - sine * 0.715, 0.072 - cosine * 0.072 + sine * 0.928],
            [0.213 - cosine * 0.213 + sine * 0.143, 0.715 + cosine * 0.285 + sine * 0.14, 0.072 - cosine * 0.072 - sine * 0.283],
            [0.213 - cosine * 0.213 - sine * 0.787, 0.715 - cosine * 0.715 + sine * 0.715, 0.072 + cosine * 0.928 + sine * 0.072]
        ]
        let s = saturation / 100
        let sm: [[Double]] = [
            [0.213 + 0.787*s, 0.715 - 0.715*s, 0.072 - 0.072*s],
            [0.213 - 0.213*s, 0.715 + 0.285*s, 0.072 - 0.072*s],
            [0.213 - 0.213*s, 0.715 - 0.715*s, 0.072 + 0.928*s]
        ]
        let data = try c.bytes()
        for i in stride(from: 0, to: data.count, by: 4) {
            if i % (plan.width * 64 * 4) == 0 { try Task.checkCancellation() }
            let alpha = Double(data[i + 3]) / 255
            if alpha == 0 { continue }
            var v = (0..<3).map { Double(data[i + $0]) / (255 * alpha) }
            v = v.map { (($0 * brightness / 100 - 0.5) * contrast / 100 + 0.5) }
            if saturation != 100 { v = sm.map { row in zip(row, v).reduce(0) { $0 + $1.0 * $1.1 } } }
            if hue != 0 { v = hm.map { row in zip(row, v).reduce(0) { $0 + $1.0 * $1.1 } } }
            for channel in 0..<3 { data[i + channel] = byte(max(0, min(1, v[channel])) * alpha * 255) }
        }
        return try c.image()
    }

    static func transform(_ source: CGImage?, _ node: [String: Any], plan: NativeRenderPlan) throws -> CGImage {
        let c = try Canvas(plan.width, plan.height)
        guard let source else { return try c.image() }
        let pivot: CGPoint
        if node["pivotMode"] as? String == "visible", let bounds = try alphaBounds(source, threshold: visibleThreshold(source)) {
            pivot = CGPoint(x: bounds.midX, y: bounds.midY)
        } else { pivot = CGPoint(x: Double(plan.width)/2, y: Double(plan.height)/2) }
        c.context.saveGState()
        c.context.setAlpha(n(node, "opacity", 100) / 100)
        c.context.translateBy(x: pivot.x + n(node, "x") * Double(plan.width) / 100,
                              y: pivot.y + n(node, "y") * Double(plan.height) / 100)
        c.context.rotate(by: n(node, "rotation") * .pi / 180)
        c.context.scaleBy(x: max(0.01, n(node, "scaleX", 100) / 100),
                          y: max(0.01, n(node, "scaleY", 100) / 100))
        c.draw(source, in: CGRect(x: -pivot.x, y: -pivot.y, width: CGFloat(plan.width), height: CGFloat(plan.height)))
        c.context.restoreGState()
        return try c.image()
    }

    static func mask(_ source: CGImage?, _ mask: CGImage?, _ node: [String: Any], plan: NativeRenderPlan) throws -> CGImage {
        guard let mask else { return try copy(source, plan: plan) }
        let output = try Canvas(plan.width, plan.height); output.draw(source)
        let prepared = try Canvas(plan.width, plan.height)
        let expand = max(0, int(node, "expand", 0))
        let feather = max(0, n(node, "feather"))
        let paintedMask = feather > 0 ? try blurred(mask, radius: feather, width: plan.width, height: plan.height) : mask
        if expand > 0 {
            for y in [-expand, 0, expand] { for x in [-expand, 0, expand] {
                prepared.draw(paintedMask, in: CGRect(x: x, y: y, width: plan.width, height: plan.height))
            } }
        }
        prepared.draw(paintedMask)
        let maskImage = try prepared.image()
        let sampled = try Canvas(plan.width, plan.height); sampled.draw(maskImage)
        let sourceBytes = try output.bytes(), maskBytes = try sampled.bytes()
        let mode = node["mode"] as? String ?? "alpha"
        for i in stride(from: 0, to: sourceBytes.count, by: 4) {
            if i % (plan.width * 64 * 4) == 0 { try Task.checkCancellation() }
            let ma = Double(maskBytes[i + 3]) / 255
            let luma = ma > 0 ? (Double(maskBytes[i]) / ma * 0.2126 + Double(maskBytes[i+1]) / ma * 0.7152 + Double(maskBytes[i+2]) / ma * 0.0722) / 255 : 0
            var factor = mode == "alpha" ? ma : (mode == "threshold" ? (luma >= n(node, "threshold", 50)/100 ? 1.0 : 0.0) : luma)
            if node["invert"] as? Bool == true { factor = 1 - factor }
            factor = max(0, min(1, factor * n(node, "opacity", 100) / 100))
            for channel in 0..<4 { sourceBytes[i+channel] = byte(Double(sourceBytes[i+channel]) * factor) }
        }
        return try output.image()
    }

    private static func blurred(_ image: CGImage, radius: Double, width: Int, height: Int) throws -> CGImage {
        let source = try Canvas(width, height); source.draw(image)
        let extent = max(1, Int(radius.rounded()))
        var data = Array(try source.bytes())
        for _ in 0..<3 {
            data = try boxBlur(data, width: width, height: height, radius: extent, horizontal: true)
            data = try boxBlur(data, width: width, height: height, radius: extent, horizontal: false)
        }
        let output = try Canvas(width, height)
        let bytes = try output.bytes()
        for i in 0..<data.count { bytes[i] = data[i] }
        return try output.image()
    }
    private static func boxBlur(_ source: [UInt8], width: Int, height: Int, radius: Int,
                                horizontal: Bool) throws -> [UInt8] {
        var output = [UInt8](repeating: 0, count: source.count)
        let lines = horizontal ? height : width, length = horizontal ? width : height
        let denominator = Double(radius * 2 + 1)
        for line in 0..<lines {
            if line % 64 == 0 { try Task.checkCancellation() }
            for channel in 0..<4 {
                func value(_ offset: Int) -> Int {
                    if offset < 0 || offset >= length { return 0 }
                    let pixel = horizontal ? line * width + offset : offset * width + line
                    return Int(source[pixel * 4 + channel])
                }
                var sum = 0
                for offset in -radius...radius { sum += value(offset) }
                for offset in 0..<length {
                    let pixel = horizontal ? line * width + offset : offset * width + line
                    output[pixel * 4 + channel] = byte(Double(sum) / denominator)
                    sum += value(offset + radius + 1) - value(offset - radius)
                }
            }
        }
        return output
    }

    private struct RNG {
        var state: UInt32
        init(_ seed: UInt32) { state = seed ^ 0x12345678 }
        mutating func next() -> Double {
            state = state &* 1_664_525 &+ 1_013_904_223
            return Double(state) / 4_294_967_296
        }
    }
    private static func hash(_ string: String) -> UInt32 {
        var value: UInt32 = 2_166_136_261
        for unit in string.utf16 { value = (value ^ UInt32(unit)) &* 16_777_619 }
        return value
    }
    private static func seed(_ node: [String: Any], _ global: UInt32) -> UInt32 {
        global &+ UInt32(truncatingIfNeeded: int(node, "seedOffset", 0)) ^ hash(node["id"] as? String ?? "")
    }

    static func repeatNode(_ source: CGImage?, _ backdrop: CGImage?, _ node: [String: Any], plan: NativeRenderPlan) throws -> CGImage {
        let c = try Canvas(plan.width, plan.height); c.draw(backdrop)
        guard let source else { return try c.image() }
        let crop: CGImage
        if let bounds = try alphaBounds(source, threshold: 8) {
            let sx = max(0, Int(bounds.minX) - 4), sy = max(0, Int(bounds.minY) - 4)
            let sw = min(source.width - sx, Int(bounds.width) + 8)
            let sh = min(source.height - sy, Int(bounds.height) + 8)
            crop = source.cropping(to: CGRect(x: sx, y: sy, width: sw, height: sh)) ?? source
        } else { crop = source }
        let unit = Double(plan.width) / 540
        let drawW = max(1, Double(crop.width) * max(0.01, n(node, "scale", 28)/100))
        let drawH = max(1, Double(crop.height) * max(0.01, n(node, "scale", 28)/100))
        let gap = max(1, n(node, "gap", 120) * unit)
        let radius = max(0, n(node, "radius", 90) * unit)
        let jitter = max(0, n(node, "jitter") * unit)
        let rotation = n(node, "rotation") * .pi / 180
        let step = n(node, "rotationStep") * .pi / 180
        let angleJitter = n(node, "rotationJitter") * .pi / 180
        let mode = node["rotationMode"] as? String ?? "fixed"
        let columns = max(1, int(node, "count", 4)), rows = max(1, int(node, "rows", 3))
        var rng = RNG(seed(node, plan.seed))
        func drawItem(_ x: Double, _ y: Double, _ index: Int, _ radialAngle: Double) throws {
            let dx = jitter == 0 ? 0 : (rng.next() - 0.5) * jitter * 2
            let dy = jitter == 0 ? 0 : (rng.next() - 0.5) * jitter * 2
            let extra = angleJitter == 0 ? 0 : (rng.next() - 0.5) * angleJitter * 2
            let angle: Double
            switch mode {
            case "radial": angle = radialAngle + extra
            case "step": angle = rotation + Double(index) * step + extra
            case "random": angle = rotation + (rng.next() - 0.5) * .pi * 2 + extra
            default: angle = rotation + extra
            }
            c.context.saveGState()
            c.context.translateBy(x: x + dx, y: y + dy)
            c.context.rotate(by: angle)
            c.context.setAlpha(n(node, "opacity", 58) / 100)
            c.context.setBlendMode(try blend(node["blendMode"] as? String ?? "screen"))
            c.draw(crop, in: CGRect(x: -drawW/2, y: -drawH/2, width: drawW, height: drawH))
            c.context.restoreGState()
        }
        if node["pattern"] as? String == "radial" {
            var index = 0
            for ring in 0..<rows {
                try Task.checkCancellation()
                let r = radius + Double(ring) * gap
                for item in 0..<columns {
                    let angle = rotation + Double(item) / Double(columns) * .pi * 2
                    try drawItem(Double(plan.width)/2 + cos(angle)*r,
                                 Double(plan.height)/2 + sin(angle)*r, index, angle)
                    index += 1
                }
            }
        } else {
            let stepX = max(gap, drawW * 0.25), stepY = max(gap, drawH * 0.25)
            for row in 0..<rows {
                try Task.checkCancellation()
                for col in 0..<columns {
                    try drawItem(Double(plan.width)/2 - Double(columns-1)*stepX/2 + Double(col)*stepX,
                                 Double(plan.height)/2 - Double(rows-1)*stepY/2 + Double(row)*stepY,
                                 row*columns+col, rotation)
                }
            }
        }
        return try c.image()
    }

    static func grimeShadow(_ source: CGImage?, _ node: [String: Any], plan: NativeRenderPlan) throws -> CGImage {
        let empty = try Canvas(plan.width, plan.height)
        guard let source else { return try empty.image() }
        let silhouette = try Canvas(plan.width, plan.height); silhouette.draw(source)
        let rgba = try rgb(node["color"] as? String ?? "#090606")
        let threshold = try visibleThreshold(source)
        silhouette.context.setBlendMode(.sourceIn)
        silhouette.context.setFillColor(CGColor(srgbRed: Double(rgba.0)/255,
                                                green: Double(rgba.1)/255,
                                                blue: Double(rgba.2)/255, alpha: 1))
        silhouette.context.fill(CGRect(x: 0, y: 0, width: plan.width, height: plan.height))
        silhouette.context.setBlendMode(.normal)
        let pixels = try silhouette.bytes()
        for i in stride(from: 0, to: pixels.count, by: 4) {
            let alpha = pixels[i+3]
            if alpha <= threshold { pixels[i] = 0; pixels[i+1] = 0; pixels[i+2] = 0; pixels[i+3] = 0 }
        }
        let shadow = try Canvas(plan.width, plan.height)
        let layers = max(1, int(node, "layers", 5))
        let unit = Double(plan.width)/540
        let spread = max(0, n(node, "spread", 14)*unit)
        let jitter = max(0, n(node, "jitter", 10)*unit)
        var rng = RNG(seed(node, plan.seed))
        for index in 0..<layers {
            try Task.checkCancellation()
            let t = Double(index+1)/Double(layers)
            let x = n(node, "x", 8)*unit*t + (jitter > 0 ? (rng.next()-0.5)*jitter : 0)
            let y = n(node, "y", 10)*unit*t + (jitter > 0 ? (rng.next()-0.5)*jitter : 0)
            let radius = spread*t
            let blurredSilhouette = n(node, "blur", 10) > 0
                ? try blurred(silhouette.image(), radius: n(node, "blur", 10)*unit*t,
                              width: plan.width, height: plan.height)
                : try silhouette.image()
            shadow.context.saveGState()
            shadow.context.setAlpha(n(node, "opacity", 58)/100 * (1.15-t*0.55))
            if radius > 0 {
                let steps = max(4, min(12, Int((radius/3).rounded())))
                for step in 0..<steps {
                    let angle = Double(step)/Double(steps) * .pi * 2
                    let rect = CGRect(x: x + cos(angle)*radius, y: y + sin(angle)*radius,
                                      width: Double(plan.width), height: Double(plan.height))
                    shadow.draw(blurredSilhouette, in: rect)
                }
            }
            shadow.draw(blurredSilhouette, in: CGRect(x: x, y: y,
                                                    width: Double(plan.width), height: Double(plan.height)))
            shadow.context.restoreGState()
        }
        if n(node, "grime", 45) > 0 {
            let amount = min(1, max(0, n(node, "grime", 45)/100))
            let data = try shadow.bytes()
            let base = seed(node, plan.seed)
            for y in 0..<plan.height {
                if y % 64 == 0 { try Task.checkCancellation() }
                for x in 0..<plan.width {
                    let i = (y*plan.width+x)*4
                    if data[i+3] == 0 { continue }
                    let fine = noise(x >> 2, y >> 2, base)
                    let coarse = noise(x >> 5, y >> 5, base ^ 0x9e3779b9)
                    let dirt = fine*0.55 + coarse*0.45
                    let factor = 1 - amount*dirt*0.82
                    for channel in 0..<4 { data[i+channel] = byte(Double(data[i+channel])*factor) }
                }
            }
        }
        let result = try Canvas(plan.width, plan.height); result.draw(try shadow.image())
        if node["shadowOnly"] as? Bool != true { result.draw(source) }
        return try result.image()
    }
    private static func noise(_ x: Int, _ y: Int, _ seed: UInt32) -> Double {
        var v = (UInt32(bitPattern: Int32(truncatingIfNeeded: x)) ^ seed) &* 374_761_393
        v = v &+ ((UInt32(bitPattern: Int32(truncatingIfNeeded: y)) ^ (seed >> 1)) &* 668_265_263)
        v ^= v >> 13; v = v &* 1_274_126_177
        return Double(v ^ (v >> 16)) / Double(UInt32.max)
    }
}
