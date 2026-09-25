import Foundation
import CoreGraphics
import CoreText
import ImageIO
import UniformTypeIdentifiers

struct RenderFailure: LocalizedError {
    let message: String
    var errorDescription: String? { message }
}

// Rendering objects live here, outside the serialized document and SwiftUI state.
actor RenderWorker {
    static let shared = RenderWorker()
    private let resources = NativeRenderResources()
    func png(plan: String) throws -> Data {
        let image = try render(plan: plan)
        try Task.checkCancellation()
        let data = try PilotRenderer.pngData(image)
        try Task.checkCancellation()
        return data
    }
    func export(plan: String, scale: Int, format: NativeExportFormat) throws -> Data {
        let image = try render(plan: plan)
        try Task.checkCancellation()
        return try NativeExportService.encode(image, scale: scale, format: format)
    }
    func render(plan: String) throws -> CGImage {
        try Task.checkCancellation()
        return try PilotRenderer(plan: NativeRenderPlan(json: plan), resources: resources).render()
    }
}

final class PilotRenderer {
    private let width: Int
    private let height: Int
    private let context: CGContext
    private let seed: UInt32
    private let layers: [[String: Any]]
    private let resources: NativeRenderResources
    private let registry: NativeRenderRegistry
    private var fonts: [String: CGFont] = [:]

    convenience init(planJSON: String) throws {
        try self.init(plan: NativeRenderPlan(json: planJSON), resources: NativeRenderResources())
    }

    init(plan: NativeRenderPlan, resources: NativeRenderResources, registry: NativeRenderRegistry = .pilot()) throws {
        guard let colorSpace = CGColorSpace(name: CGColorSpace.sRGB),
              let context = CGContext(data: nil, width: plan.width, height: plan.height, bitsPerComponent: 8,
                  bytesPerRow: plan.width * 4, space: colorSpace,
                  bitmapInfo: CGBitmapInfo.byteOrder32Big.rawValue | CGImageAlphaInfo.premultipliedLast.rawValue)
        else { throw RenderFailure(message: "Invalid render plan") }
        self.width = plan.width; self.height = plan.height; self.context = context
        self.layers = plan.layers; self.seed = plan.seed
        self.resources = resources; self.registry = registry
        context.translateBy(x: 0, y: CGFloat(plan.height)); context.scaleBy(x: 1, y: -1)
        context.interpolationQuality = .high
        for asset in plan.fontAssets {
            guard let id = asset["id"] as? String, let url = asset["dataUrl"] as? String,
                  !id.isEmpty else { throw RenderFailure(message: "Invalid embedded font") }
            fonts["artifact-font://" + id] = try resources.font(url)
        }
        if plan.background != "transparent" {
            context.setFillColor(try color(plan.background)); context.fill(CGRect(x: 0, y: 0, width: width, height: height))
        }
    }
    private func n(_ obj: [String: Any], _ key: String, _ fallback: Double = 0) -> Double {
        (obj[key] as? NSNumber)?.doubleValue ?? fallback
    }
    private func color(_ value: String) throws -> CGColor {
        guard value.count == 7, value.first == "#", let rgb = UInt32(value.dropFirst(), radix: 16) else {
            throw RenderFailure(message: "Only six-digit hex colors are supported")
        }
        return CGColor(srgbRed: Double((rgb >> 16) & 255) / 255, green: Double((rgb >> 8) & 255) / 255,
                       blue: Double(rgb & 255) / 255, alpha: 1)
    }
    private func line(_ text: String, font: CTFont, color: CGColor) -> CTLine {
        CTLineCreateWithAttributedString(NSAttributedString(string: text, attributes: [
            NSAttributedString.Key(kCTFontAttributeName as String): font,
            NSAttributedString.Key(kCTForegroundColorAttributeName as String): color
        ]))
    }
    private func middleBaseline(_ font: CTFont) -> Double {
        // CoreText ascent includes headroom outside the visible Latin letter box.
        // Center the cap-height/descent box for Canvas textBaseline=middle.
        LayerGeometry.middleBaseline(font)
    }
    private func drawText(_ text: String, font: CTFont, color: CGColor, align: String, maxWidth: Double, latinBaseline: Bool = true) {
        let l = line(text, font: font, color: color)
        let advance = CTLineGetTypographicBounds(l, nil, nil, nil)
        let x = align == "center" ? -advance / 2 : (align == "right" ? -advance : 0)
        context.saveGState()
        context.scaleBy(x: advance > maxWidth ? maxWidth / advance : 1, y: -1)
        context.textMatrix = .identity
        context.textPosition = CGPoint(x: x, y: -(latinBaseline ? middleBaseline(font) : CTFontGetSize(font) / 2))
        CTLineDraw(l, context)
        context.restoreGState()
    }
    func paintText(_ layer: [String: Any]) throws {
        let fontID = layer["font"] as? String ?? ""
        let font: CTFont
        let size = n(layer,"size") * Double(width) / 540
        if fontID == "MONO" { font = CTFontCreateWithName("Courier New" as CFString, size, nil) }
        else if let cgFont = fonts[fontID] { font = CTFontCreateWithGraphicsFont(cgFont, size, nil, nil) }
        else { throw RenderFailure(message: "Embedded text font is missing; no font substitution was made") }
        let text = layer["content"] as? String ?? ""
        // Layout consumes whitespace; newline/tab are not drawable font glyphs.
        var chars = Array(text.filter { !$0.isWhitespace }.utf16)
        if chars.isEmpty { return }
        var glyphs = [CGGlyph](repeating: 0, count: chars.count)
        guard CTFontGetGlyphsForCharacters(font, &chars, &glyphs, chars.count) else {
            throw RenderFailure(message: "Embedded font is missing required glyphs")
        }
        let fill = try color(layer["color"] as? String ?? "#000000")
        let lines = LayerGeometry.textLines(text, font: font, color: fill,
            align: layer["align"] as? String ?? "center", width: width)
        context.translateBy(x: n(layer,"x") * Double(width), y: n(layer,"y") * Double(height))
        context.rotate(by: n(layer,"rotation") * .pi / 180)
        context.scaleBy(x: n(layer,"scaleX",1), y: n(layer,"scaleY",1))
        for item in lines {
            context.saveGState()
            context.translateBy(x: 0, y: item.origin.y)
            context.scaleBy(x: item.horizontalScale, y: -1)
            context.textMatrix = .identity
            context.textPosition = CGPoint(x: item.origin.x, y: -LayerGeometry.middleBaseline(font))
            CTLineDraw(item.line, context)
            context.restoreGState()
        }
    }
    func paintImage(_ layer: [String: Any]) throws {
        let image = try resources.image(layer["src"] as? String ?? "")
        let fit = layer["fit"] as? String ?? "free"
        if fit == "tile" {
            let tileWidth = Double(image.width) * Double(width) / 540 * n(layer,"scaleX",1)
            let tileHeight = Double(image.height) * Double(height) / 540 * n(layer,"scaleY",1)
            guard tileWidth.isFinite, tileHeight.isFinite, tileWidth > 0, tileHeight > 0 else {
                throw RenderFailure(message: "Invalid image tile size")
            }
            context.clip(to: CGRect(x: 0, y: 0, width: width, height: height))
            // CoreGraphics tiles over the clipped bitmap in one call; a nested
            // draw loop can queue millions of tiny image operations.
            context.saveGState()
            context.translateBy(x: 0, y: tileHeight)
            context.scaleBy(x: 1, y: -1)
            context.draw(image, in: CGRect(x: 0, y: 0, width: tileWidth, height: tileHeight), byTiling: true)
            context.restoreGState()
            return
        }
        let rect = LayerGeometry.imageBounds(image, layer: layer, width: width, height: height)
        context.translateBy(x: n(layer,"x") * Double(width), y: n(layer,"y") * Double(height))
        context.rotate(by: n(layer,"rotation") * .pi / 180)
        context.scaleBy(x: n(layer,"scaleX",1), y: -n(layer,"scaleY",1))
        context.draw(image, in: rect)
    }
    func paintEmoji(_ layer: [String: Any]) throws {
        for item in layer["renderItems"] as? [[String: Any]] ?? [] {
            context.saveGState()
            context.translateBy(x: n(item,"x"), y: n(item,"y")); context.rotate(by: n(item,"rotation"))
            context.setAlpha(n(item,"opacity",1) * n(layer,"opacity",100) / 100)
            let font = CTFontCreateWithName("Apple Color Emoji" as CFString, n(item,"size"), nil)
            drawText(item["emoji"] as? String ?? "", font: font, color: CGColor(gray: 1, alpha: 1), align: "center", maxWidth: .infinity, latinBaseline: false)
            context.restoreGState()
        }
    }

    private func blendMode(_ name: String) throws -> CGBlendMode {
        switch name {
        case "normal": return .normal
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
        default: throw RenderFailure(message: "Unsupported 2D blend mode")
        }
    }

    func render(diagnostics: URL? = nil) throws -> CGImage {
        let target = NativeRasterTarget(width: width, height: height, seed: seed, context: context, resources: resources,
                                        paintText: { try self.paintText($0) }, paintImage: { try self.paintImage($0) },
                                        paintEmoji: { try self.paintEmoji($0) })
        for (index, layer) in layers.enumerated() where layer["visible"] as? Bool != false {
            try Task.checkCancellation()
            context.saveGState(); defer { context.restoreGState() }
            context.setAlpha(n(layer,"opacity",100) / 100)
            context.setBlendMode(try blendMode(layer["blendMode"] as? String ?? "normal"))
            try registry.paint(layer, on: target)
            if let directory = diagnostics, let image = context.makeImage() {
                try Self.writePNG(image, to: directory.appendingPathComponent(String(format: "%02d.png",index)))
            }
        }
        guard let image = context.makeImage() else { throw RenderFailure(message: "Cannot create rendered image") }
        return image
    }
    static func writePNG(_ image: CGImage, to url: URL) throws {
        try pngData(image).write(to: url, options: .atomic)
    }
    static func pngData(_ image: CGImage) throws -> Data {
        let data = NSMutableData()
        guard let destination = CGImageDestinationCreateWithData(data, UTType.png.identifier as CFString, 1, nil) else {
            throw RenderFailure(message: "Cannot create PNG")
        }
        CGImageDestinationAddImage(destination, image, nil)
        guard CGImageDestinationFinalize(destination) else { throw RenderFailure(message: "Cannot encode PNG") }
        return data as Data
    }
}
