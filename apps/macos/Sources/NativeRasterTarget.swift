import CoreGraphics
import Foundation

// A bounded, transient surface for independently registered native modules.
// Pixel kernels receive straight sRGB RGBA; the bitmap remains premultiplied.
struct NativeRasterTarget {
    let width: Int
    let height: Int
    let seed: UInt32
    let context: CGContext
    let resources: NativeRenderResources
    let paintText: ([String: Any]) throws -> Void
    let paintImage: ([String: Any]) throws -> Void
    let paintEmoji: ([String: Any]) throws -> Void

    func image(_ source: String) throws -> CGImage { try resources.image(source) }
    func font(_ source: String) throws -> CGFont { try resources.font(source) }

    func color(_ value: String) throws -> CGColor {
        guard value.count == 7, value.first == "#", let rgb = UInt32(value.dropFirst(), radix: 16) else {
            throw RenderFailure(message: "Only six-digit hex colors are supported")
        }
        return CGColor(srgbRed: Double((rgb >> 16) & 255) / 255,
                       green: Double((rgb >> 8) & 255) / 255,
                       blue: Double(rgb & 255) / 255, alpha: 1)
    }

    func applyPixels(_ kernel: (Data) throws -> Data) throws {
        guard let data = context.data else { throw RenderFailure(message: "Missing pixel buffer") }
        let size = width * height * 4
        let bytes = data.bindMemory(to: UInt8.self, capacity: size)
        var straight = [UInt8](repeating: 0, count: size)
        for i in stride(from: 0, to: size, by: 4) {
            if i % (width * 64 * 4) == 0 { try Task.checkCancellation() }
            let alpha = Double(bytes[i + 3]); straight[i + 3] = bytes[i + 3]
            for channel in 0..<3 {
                straight[i + channel] = alpha > 0
                    ? UInt8(min(255, (Double(bytes[i + channel]) * 255 / alpha).rounded(.toNearestOrEven))) : 0
            }
        }
        let result = try kernel(Data(straight))
        guard result.count == size else { throw RenderFailure(message: "Effect returned the wrong pixel count") }
        try Task.checkCancellation()
        for i in stride(from: 0, to: size, by: 4) {
            if i % (width * 64 * 4) == 0 { try Task.checkCancellation() }
            bytes[i + 3] = result[i + 3]
            for channel in 0..<3 {
                bytes[i + channel] = UInt8((Double(result[i + channel]) * Double(result[i + 3]) / 255).rounded(.toNearestOrEven))
            }
        }
    }
}
