import CoreGraphics
import CoreText
import Foundation

// One layout is used by raster painting, canvas hit testing and handles.
// Rectangles are in untransformed raster coordinates, relative to the layer anchor.
struct TextLineLayout {
    let line: CTLine
    let origin: CGPoint
    let horizontalScale: CGFloat
    let ink: CGRect
}

struct LayerGeometry {
    static func number(_ layer: [String: Any], _ key: String, _ fallback: Double = 0) -> Double {
        (layer[key] as? NSNumber)?.doubleValue ?? fallback
    }

    static func middleBaseline(_ font: CTFont) -> CGFloat {
        (CTFontGetCapHeight(font) - CTFontGetDescent(font)) / 2
    }

    static func textLines(_ content: String, font: CTFont, color: CGColor, align: String, width: Int) -> [TextLineLayout] {
        let maxWidth = CGFloat(width) * 0.92
        func makeLine(_ value: String) -> CTLine {
            CTLineCreateWithAttributedString(NSAttributedString(string: value, attributes: [
                NSAttributedString.Key(kCTFontAttributeName as String): font,
                NSAttributedString.Key(kCTForegroundColorAttributeName as String): color
            ]))
        }
        var texts: [String] = []
        for paragraph in content.components(separatedBy: "\n") {
            var current = ""
            for word in paragraph.split(whereSeparator: { $0.isWhitespace }) {
                let candidate = current.isEmpty ? String(word) : current + " " + word
                if !current.isEmpty && CTLineGetTypographicBounds(makeLine(candidate), nil, nil, nil) > maxWidth {
                    texts.append(current)
                    current = String(word)
                } else { current = candidate }
            }
            texts.append(current)
        }
        return texts.enumerated().map { index, value in
            let line = makeLine(value)
            let advance = CGFloat(CTLineGetTypographicBounds(line, nil, nil, nil))
            let compression = advance > maxWidth ? maxWidth / advance : 1
            let x = align == "center" ? -advance / 2 : (align == "right" ? -advance : 0)
            let y = (CGFloat(index) - CGFloat(texts.count - 1) / 2) * CTFontGetSize(font) * 1.25
            let glyphBounds = CTLineGetImageBounds(line, nil)
            // Renderer flips CoreText Y, then offsets its cap-height baseline.
            let ink = CGRect(x: (x + glyphBounds.minX) * compression,
                             y: y + middleBaseline(font) - glyphBounds.maxY,
                             width: glyphBounds.width * compression, height: glyphBounds.height)
            return TextLineLayout(line: line, origin: CGPoint(x: x, y: y), horizontalScale: compression, ink: ink)
        }
    }

    static func textBounds(_ lines: [TextLineLayout]) -> CGRect {
        lines.filter { !$0.ink.isEmpty }.reduce(CGRect.null) { $0.union($1.ink) }
    }

    static func imageBounds(_ image: CGImage, layer: [String: Any], width: Int, height: Int) -> CGRect {
        let fit = layer["fit"] as? String ?? "free"
        if fit == "tile" { return CGRect(x: 0, y: 0, width: width, height: height) }
        let a = Double(width) / Double(image.width), b = Double(height) / Double(image.height)
        let scale = fit == "cover" ? max(a,b) : (fit == "contain" ? min(a,b) : Double(width) / 540)
        let w = Double(image.width) * scale
        let h = Double(image.height) * scale
        return CGRect(x: -w/2, y: -h/2, width: w, height: h)
    }

    static func transformedBounds(_ local: CGRect, layer: [String: Any], width: Int, height: Int) -> CGRect {
        guard !local.isNull else { return .null }
        let sx = number(layer,"scaleX",1), sy = number(layer,"scaleY",1)
        let angle = number(layer,"rotation") * .pi / 180
        let transform = CGAffineTransform(translationX: number(layer,"x") * Double(width), y: number(layer,"y") * Double(height))
            .rotated(by: angle).scaledBy(x: sx, y: sy)
        return local.applying(transform)
    }

    static func contains(_ point: CGPoint, local: CGRect, layer: [String: Any], width: Int, height: Int) -> Bool {
        guard !local.isNull else { return false }
        let sx = number(layer,"scaleX",1), sy = number(layer,"scaleY",1)
        guard sx > 0, sy > 0 else { return false }
        let angle = number(layer,"rotation") * .pi / 180
        let transform = CGAffineTransform(translationX: number(layer,"x") * Double(width), y: number(layer,"y") * Double(height))
            .rotated(by: angle).scaledBy(x: sx, y: sy)
        return local.contains(point.applying(transform.inverted()))
    }
}

// Decoded assets are a transient view resource, never part of CanvasDocument.
final class LayerGeometryResolver {
    private let resources = NativeRenderResources()
    private var fonts: [String: CGFont] = [:]
    private var imageSources: [String: String] = [:]
    private var revision = -1
    func needsUpdate(for revision: Int) -> Bool { self.revision != revision }
    func invalidate() { revision = -1 }

    func update(documentJSON: String, revision: Int) throws {
        guard revision != self.revision else { return }
        guard let root = try JSONSerialization.jsonObject(with: Data(documentJSON.utf8)) as? [String: Any],
              let document = root["document"] as? [String: Any] else { throw RenderFailure(message: "Invalid project geometry") }
        var next: [String: CGFont] = [:]
        for asset in document["fontAssets"] as? [[String: Any]] ?? [] {
            guard let id = asset["id"] as? String, let url = asset["dataUrl"] as? String else { continue }
            next["artifact-font://" + id] = try resources.font(url)
        }
        fonts = next
        imageSources = Dictionary(uniqueKeysWithValues: (document["layers"] as? [[String: Any]] ?? []).compactMap { layer in
            guard layer["kind"] as? String == "image", let id = layer["id"] as? String,
                  let src = layer["src"] as? String else { return nil }
            return (id, src)
        })
        self.revision = revision
    }

    func localBounds(_ layer: [String: Any], width: Int, height: Int) throws -> CGRect {
        switch layer["kind"] as? String {
        case "text":
            let size = LayerGeometry.number(layer,"size",74) * Double(width) / 540
            let fontID = layer["font"] as? String ?? "MONO"
            let font: CTFont
            if fontID == "MONO" { font = CTFontCreateWithName("Courier New" as CFString, size, nil) }
            else if let cgFont = fonts[fontID] { font = CTFontCreateWithGraphicsFont(cgFont, size, nil, nil) }
            else { throw RenderFailure(message: "Embedded text font is missing") }
            return LayerGeometry.textBounds(LayerGeometry.textLines(layer["content"] as? String ?? "", font: font,
                color: CGColor(gray: 1, alpha: 1), align: layer["align"] as? String ?? "center", width: width))
        case "image":
            if layer["fit"] as? String == "tile" { return .null }
            let source = (layer["src"] as? String) ?? imageSources[layer["id"] as? String ?? ""] ?? ""
            return LayerGeometry.imageBounds(try resources.image(source), layer: layer,
                width: width, height: height)
        default: return .null
        }
    }
}
