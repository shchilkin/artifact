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
    func png(plan: String) throws -> Data {
        let image = try render(plan: plan)
        try Task.checkCancellation()
        let data = try PilotRenderer.pngData(image)
        try Task.checkCancellation()
        return data
    }
    func render(plan: String) throws -> CGImage {
        try Task.checkCancellation()
        return try PilotRenderer(planJSON: plan).render()
    }
}

final class PilotRenderer {
    private let width: Int
    private let height: Int
    private let context: CGContext
    private let seed: UInt32
    private let layers: [[String: Any]]
    private var fonts: [String: CGFont] = [:]

    init(planJSON: String) throws {
        guard let plan = try JSONSerialization.jsonObject(with: Data(planJSON.utf8)) as? [String: Any],
              let width = plan["width"] as? Int, let height = plan["height"] as? Int,
              let layers = plan["layers"] as? [[String: Any]],
              (1...3000).contains(width), (1...3000).contains(height),
              let colorSpace = CGColorSpace(name: CGColorSpace.sRGB),
              let context = CGContext(data: nil, width: width, height: height, bitsPerComponent: 8,
                  bytesPerRow: width * 4, space: colorSpace,
                  bitmapInfo: CGBitmapInfo.byteOrder32Big.rawValue | CGImageAlphaInfo.premultipliedLast.rawValue)
        else { throw RenderFailure(message: "Invalid render plan") }
        self.width = width; self.height = height; self.context = context
        self.layers = layers; self.seed = (plan["seed"] as? NSNumber)?.uint32Value ?? 0
        context.translateBy(x: 0, y: CGFloat(height)); context.scaleBy(x: 1, y: -1)
        context.interpolationQuality = .high
        for asset in plan["fontAssets"] as? [[String: Any]] ?? [] {
            guard let id = asset["id"] as? String, let url = asset["dataUrl"] as? String,
                  let provider = CGDataProvider(data: try Self.decode(url) as CFData),
                  let font = CGFont(provider) else { throw RenderFailure(message: "Invalid embedded font") }
            fonts["artifact-font://" + id] = font
        }
        if let background = plan["background"] as? String, background != "transparent" {
            context.setFillColor(try color(background)); context.fill(CGRect(x: 0, y: 0, width: width, height: height))
        }
    }

    static func decode(_ url: String) throws -> Data {
        guard url.hasPrefix("data:"), let comma = url.firstIndex(of: ","), url[..<comma].hasSuffix(";base64"),
              let data = Data(base64Encoded: String(url[url.index(after: comma)...]))
        else { throw RenderFailure(message: "Rendering requires valid embedded assets") }
        return data
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
        // Canvas middle anchors the em square, rather than CoreText's typographic
        // ascent/descent box (the embedded pixel font's box is shorter than em).
        CTFontGetSize(font) / 2
    }
    private func drawText(_ text: String, font: CTFont, color: CGColor, align: String, maxWidth: Double) {
        let l = line(text, font: font, color: color)
        let advance = CTLineGetTypographicBounds(l, nil, nil, nil)
        let x = align == "center" ? -advance / 2 : (align == "right" ? -advance : 0)
        context.saveGState()
        context.scaleBy(x: advance > maxWidth ? maxWidth / advance : 1, y: -1)
        context.textMatrix = .identity
        context.textPosition = CGPoint(x: x, y: -middleBaseline(font))
        CTLineDraw(l, context)
        context.restoreGState()
    }
    private func textLayer(_ layer: [String: Any]) throws {
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
        let maxWidth = Double(width) * 0.92
        var lines: [String] = []
        for paragraph in text.components(separatedBy: "\n") {
            var current = ""
            for word in paragraph.split(whereSeparator: { $0.isWhitespace }) {
                let candidate = current.isEmpty ? String(word) : current + " " + word
                if !current.isEmpty && CTLineGetTypographicBounds(line(candidate, font: font, color: fill), nil, nil, nil) > maxWidth {
                    lines.append(current); current = String(word)
                } else { current = candidate }
            }
            lines.append(current)
        }
        context.translateBy(x: n(layer,"x") * Double(width), y: n(layer,"y") * Double(height))
        context.rotate(by: n(layer,"rotation") * .pi / 180)
        context.scaleBy(x: n(layer,"scaleX",1), y: n(layer,"scaleY",1))
        for (index, text) in lines.enumerated() {
            context.saveGState()
            context.translateBy(x: 0, y: (Double(index) - Double(lines.count - 1) / 2) * CTFontGetSize(font) * 1.25)
            drawText(text, font: font, color: fill, align: layer["align"] as? String ?? "center", maxWidth: maxWidth)
            context.restoreGState()
        }
    }
    private func imageLayer(_ layer: [String: Any]) throws {
        let data = try Self.decode(layer["src"] as? String ?? "")
        guard let source = CGImageSourceCreateWithData(data as CFData, nil),
              let image = CGImageSourceCreateImageAtIndex(source, 0, nil) else { throw RenderFailure(message: "Cannot decode embedded image") }
        let fit = layer["fit"] as? String ?? "free"
        let a = Double(width) / Double(image.width), b = Double(height) / Double(image.height)
        let scale = fit == "cover" ? max(a,b) : (fit == "contain" ? min(a,b) : Double(width) / 540)
        let w = Double(image.width) * scale * n(layer,"scaleX",1), h = Double(image.height) * scale * n(layer,"scaleY",1)
        context.translateBy(x: n(layer,"x") * Double(width), y: n(layer,"y") * Double(height))
        context.rotate(by: n(layer,"rotation") * .pi / 180); context.scaleBy(x: 1, y: -1)
        context.draw(image, in: CGRect(x: -w/2, y: -h/2, width: w, height: h))
    }
    private func applyEffect(_ layer: [String: Any]) throws {
        guard let data = context.data else { throw RenderFailure(message: "Missing pixel buffer") }
        let size = width * height * 4
        let bytes = data.bindMemory(to: UInt8.self, capacity: size)
        var straight = [UInt8](repeating: 0, count: size)
        for i in stride(from: 0, to: size, by: 4) {
            let a = Double(bytes[i+3]); straight[i+3] = bytes[i+3]
            for c in 0..<3 { straight[i+c] = a > 0 ? UInt8(min(255,(Double(bytes[i+c]) * 255 / a).rounded(.toNearestOrEven))) : 0 }
        }
        let json = String(data: try JSONSerialization.data(withJSONObject: layer), encoding: .utf8)!
        let result = try renderEffect(pixels: Data(straight), width: UInt32(width), height: UInt32(height), layerJson: json, seed: seed)
        for i in stride(from: 0, to: size, by: 4) {
            bytes[i+3] = result[i+3]
            for c in 0..<3 { bytes[i+c] = UInt8((Double(result[i+c]) * Double(result[i+3]) / 255).rounded(.toNearestOrEven)) }
        }
    }
    func render(diagnostics: URL? = nil) throws -> CGImage {
        for (index, layer) in layers.enumerated() where layer["visible"] as? Bool != false {
            try Task.checkCancellation()
            context.saveGState(); defer { context.restoreGState() }
            context.setAlpha(n(layer,"opacity",100) / 100)
            switch layer["kind"] as? String {
            case "fill": context.setFillColor(try color(layer["color"] as? String ?? "#000000")); context.fill(CGRect(x: 0, y: 0, width: width, height: height))
            case "text": try textLayer(layer)
            case "image": try imageLayer(layer)
            case "effect": try applyEffect(layer)
            case "emoji":
                for item in layer["renderItems"] as? [[String: Any]] ?? [] {
                    context.saveGState()
                    context.translateBy(x: n(item,"x"), y: n(item,"y")); context.rotate(by: n(item,"rotation"))
                    context.setAlpha(n(item,"opacity",1) * n(layer,"opacity",100) / 100)
                    let font = CTFontCreateWithName("Apple Color Emoji" as CFString, n(item,"size"), nil)
                    drawText(item["emoji"] as? String ?? "", font: font, color: CGColor(gray: 1, alpha: 1), align: "center", maxWidth: .infinity)
                    context.restoreGState()
                }
            default: throw RenderFailure(message: "Unsupported render layer")
            }
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
