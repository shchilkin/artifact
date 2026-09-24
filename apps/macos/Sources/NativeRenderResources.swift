import CoreGraphics
import Foundation
import ImageIO

// Owned by RenderWorker. Decoded resources are retained across preview frames,
// bounded by decoded bytes, and never serialized through the document session.
final class NativeRenderResources {
    private struct ImageEntry { let image: CGImage; let bytes: Int }
    private struct FontEntry { let font: CGFont; let bytes: Int }
    private var images: [String: ImageEntry] = [:]
    private var fonts: [String: FontEntry] = [:]
    private var order: [String] = []
    private var retainedBytes = 0
    private let budget = 96 * 1024 * 1024

    func image(_ source: String) throws -> CGImage {
        let key = "image:" + source
        if let entry = images[key] { touch(key); return entry.image }
        let data = try Self.decode(source)
        guard let imageSource = CGImageSourceCreateWithData(data as CFData, nil),
              let image = CGImageSourceCreateImageAtIndex(imageSource, 0, nil)
        else { throw RenderFailure(message: "Cannot decode embedded image") }
        let bytes = image.bytesPerRow * image.height + source.utf8.count
        if bytes <= budget {
            insert(key, bytes: bytes)
            images[key] = ImageEntry(image: image, bytes: bytes)
        }
        return image
    }

    func font(_ source: String) throws -> CGFont {
        let key = "font:" + source
        if let entry = fonts[key] { touch(key); return entry.font }
        let data = try Self.decode(source)
        guard let provider = CGDataProvider(data: data as CFData), let font = CGFont(provider)
        else { throw RenderFailure(message: "Invalid embedded font") }
        let bytes = data.count + source.utf8.count
        if bytes <= budget {
            insert(key, bytes: bytes)
            fonts[key] = FontEntry(font: font, bytes: bytes)
        }
        return font
    }

    private func touch(_ key: String) { order.removeAll { $0 == key }; order.append(key) }
    private func insert(_ key: String, bytes: Int) {
        while retainedBytes + bytes > budget, let oldest = order.first {
            order.removeFirst()
            if let image = images.removeValue(forKey: oldest) { retainedBytes -= image.bytes }
            if let font = fonts.removeValue(forKey: oldest) { retainedBytes -= font.bytes }
        }
        retainedBytes += bytes
        order.append(key)
    }

    static func decode(_ url: String) throws -> Data {
        guard url.hasPrefix("data:"), let comma = url.firstIndex(of: ","), url[..<comma].hasSuffix(";base64"),
              let data = Data(base64Encoded: String(url[url.index(after: comma)...]))
        else { throw RenderFailure(message: "Rendering requires valid embedded assets") }
        return data
    }
}
