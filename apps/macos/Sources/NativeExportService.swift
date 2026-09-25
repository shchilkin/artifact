import CoreGraphics
import Foundation
import ImageIO
import UniformTypeIdentifiers

enum NativeExportFormat: String, CaseIterable {
    case png, jpeg

    var type: UTType { self == .png ? .png : .jpeg }
    var extensionName: String { self == .png ? "png" : "jpg" }
}

// Web renders effects at ASPECT_SIZES, then scales the completed bitmap with
// imageSmoothingEnabled=false. Neither preview pixels nor a scaled render plan
// are inputs to this service.
enum NativeExportService {
    static func encode(_ image: CGImage, scale: Int, format: NativeExportFormat) throws -> Data {
        guard (1...3).contains(scale) else { throw RenderFailure(message: "Choose export scale 1, 2 or 3.") }
        try Task.checkCancellation()
        let output: CGImage
        if scale == 1 && format == .png {
            output = image
        } else {
            let width = image.width * scale
            let height = image.height * scale
            guard let space = CGColorSpace(name: CGColorSpace.sRGB),
                  let context = CGContext(data: nil, width: width, height: height, bitsPerComponent: 8,
                      bytesPerRow: width * 4, space: space,
                      bitmapInfo: CGBitmapInfo.byteOrder32Big.rawValue | CGImageAlphaInfo.premultipliedLast.rawValue)
            else { throw RenderFailure(message: "Cannot allocate export bitmap.") }
            if format == .jpeg {
                context.setFillColor(CGColor(srgbRed: 0, green: 0, blue: 0, alpha: 1))
                context.fill(CGRect(x: 0, y: 0, width: width, height: height))
            }
            context.interpolationQuality = .none
            context.draw(image, in: CGRect(x: 0, y: 0, width: width, height: height))
            guard let scaled = context.makeImage() else { throw RenderFailure(message: "Cannot create export bitmap.") }
            output = scaled
        }
        try Task.checkCancellation()
        let data = NSMutableData()
        guard let destination = CGImageDestinationCreateWithData(data, format.type.identifier as CFString, 1, nil) else {
            throw RenderFailure(message: "Cannot create export file.")
        }
        let properties: CFDictionary? = format == .jpeg
            ? [kCGImageDestinationLossyCompressionQuality: 0.92] as CFDictionary : nil
        CGImageDestinationAddImage(destination, output, properties)
        guard CGImageDestinationFinalize(destination) else { throw RenderFailure(message: "Cannot encode export image.") }
        try Task.checkCancellation()
        return data as Data
    }
}
