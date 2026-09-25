import AppKit
import ImageIO
import UniformTypeIdentifiers

@main struct ImageCheck {
    static func require(_ value: Bool, _ message: String) { precondition(value, message) }
    static func pixels(_ image: CGImage) -> [UInt8] {
        let context = CGContext(data: nil, width: image.width, height: image.height,
            bitsPerComponent: 8, bytesPerRow: image.width * 4,
            space: CGColorSpace(name: CGColorSpace.sRGB)!,
            bitmapInfo: CGImageAlphaInfo.premultipliedLast.rawValue)!
        context.draw(image, in: CGRect(x: 0, y: 0, width: image.width, height: image.height))
        return Array(UnsafeBufferPointer(start: context.data!.assumingMemoryBound(to: UInt8.self), count: image.width * image.height * 4))
    }
    static func main() async throws {
        guard CommandLine.arguments.count == 2 else { fatalError("image-check OUTPUT_DIRECTORY") }
        let out = URL(fileURLWithPath: CommandLine.arguments[1])
        try FileManager.default.createDirectory(at: out, withIntermediateDirectories: true)
        let context = CGContext(data: nil, width: 80, height: 40, bitsPerComponent: 8, bytesPerRow: 80 * 4,
            space: CGColorSpace(name: CGColorSpace.sRGB)!, bitmapInfo: CGImageAlphaInfo.premultipliedLast.rawValue)!
        context.setFillColor(NSColor.red.cgColor); context.fill(CGRect(x: 0, y: 0, width: 40, height: 40))
        context.setFillColor(NSColor.blue.cgColor); context.fill(CGRect(x: 40, y: 0, width: 40, height: 40))
        let image = context.makeImage()!
        let jpegURL = out.appendingPathComponent("orientation-6.jpg")
        let jpeg = CGImageDestinationCreateWithURL(jpegURL as CFURL, UTType.jpeg.identifier as CFString, 1, nil)!
        CGImageDestinationAddImage(jpeg, image, [kCGImagePropertyOrientation: 6] as CFDictionary)
        require(CGImageDestinationFinalize(jpeg), "JPEG encode")
        let oriented = try await ImageImport.shared.read(jpegURL)
        let orientedData = Data(base64Encoded: String(oriented.split(separator: ",")[1]))!
        let orientedImage = CGImageSourceCreateImageAtIndex(CGImageSourceCreateWithData(orientedData as CFData, nil)!, 0, nil)!
        require(orientedImage.width == 40 && orientedImage.height == 80, "EXIF orientation not baked")
        try orientedData.write(to: out.appendingPathComponent("replacement.png"))
        context.clear(CGRect(x: 0, y: 0, width: 80, height: 40))
        context.setFillColor(NSColor.green.withAlphaComponent(0.5).cgColor)
        context.fill(CGRect(x: 20, y: 10, width: 40, height: 20))
        let transparent = context.makeImage()!
        let pngURL = out.appendingPathComponent("transparent.png")
        try PilotRenderer.pngData(transparent).write(to: pngURL)
        let png = try await ImageImport.shared.read(pngURL)
        let data = Data(base64Encoded: String(png.split(separator: ",")[1]))!
        let decoded = CGImageSourceCreateImageAtIndex(CGImageSourceCreateWithData(data as CFData, nil)!, 0, nil)!
        require(pixels(decoded) == pixels(transparent), "PNG transparency changed")
        let tiff = NSBitmapImageRep(cgImage: transparent).representation(using: .tiff, properties: [:])!
        let clipboardPNG = try await ImageImport.shared.readClipboard(tiff)
        let clipboardBytes = Data(base64Encoded: String(clipboardPNG.split(separator: ",")[1]))!
        let clipboardImage = CGImageSourceCreateImageAtIndex(CGImageSourceCreateWithData(clipboardBytes as CFData, nil)!, 0, nil)!
        require(pixels(clipboardImage) == pixels(transparent), "TIFF clipboard alpha changed")
        let invalid = out.appendingPathComponent("invalid.png")
        try Data("not an image".utf8).write(to: invalid)
        do { _ = try await ImageImport.shared.read(invalid); fatalError("Invalid file accepted") } catch {}
        print("PASS: native PNG/TIFF clipboard alpha preservation, JPEG EXIF normalization, invalid image rejection")
    }
}
