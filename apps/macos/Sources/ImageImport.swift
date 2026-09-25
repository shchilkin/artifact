import Foundation
import ImageIO
import UniformTypeIdentifiers

actor ImageImport {
    static let shared = ImageImport()

    func read(_ url: URL) throws -> String {
        let info = try url.resourceValues(forKeys: [.fileSizeKey])
        guard let size = info.fileSize, size <= 8 * 1024 * 1024 else {
            throw RenderFailure(message: "Choose a PNG or JPEG up to 8 MiB.")
        }
        let data = try Data(contentsOf: url)
        return try read(data)
    }

    func read(_ data: Data) throws -> String {
        try normalized(data, allowTIFF: false)
    }

    func readClipboard(_ data: Data) throws -> String {
        try normalized(data, allowTIFF: true)
    }

    private func normalized(_ data: Data, allowTIFF: Bool) throws -> String {
        guard data.count <= 8 * 1024 * 1024,
              let source = CGImageSourceCreateWithData(data as CFData, nil),
              let type = CGImageSourceGetType(source),
              ([UTType.png.identifier, UTType.jpeg.identifier] + (allowTIFF ? [UTType.tiff.identifier] : [])).contains(type as String),
              let properties = CGImageSourceCopyPropertiesAtIndex(source, 0, nil) as? [CFString: Any],
              let width = properties[kCGImagePropertyPixelWidth] as? Int,
              let height = properties[kCGImagePropertyPixelHeight] as? Int,
              (1...4096).contains(width), (1...4096).contains(height) else {
            throw RenderFailure(message: "Choose a PNG or JPEG no larger than 4096 × 4096 pixels.")
        }
        // Transform bakes EXIF orientation into pixels before portable storage.
        let options: [CFString: Any] = [
            kCGImageSourceCreateThumbnailFromImageAlways: true,
            kCGImageSourceCreateThumbnailWithTransform: true,
            kCGImageSourceThumbnailMaxPixelSize: max(width, height)
        ]
        guard let image = CGImageSourceCreateThumbnailAtIndex(source, 0, options as CFDictionary) else {
            throw RenderFailure(message: "Cannot decode this image.")
        }
        try Task.checkCancellation()
        let png = try PilotRenderer.pngData(image)
        guard png.count <= 16 * 1024 * 1024 else {
            throw RenderFailure(message: "Decoded PNG exceeds 16 MiB. Choose a smaller image.")
        }
        return "data:image/png;base64," + png.base64EncodedString()
    }
}
