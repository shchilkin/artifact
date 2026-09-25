import CoreGraphics
import Foundation

struct ImportedFont {
    let reference: String
    let asset: [String: Any]
}

actor FontImport {
    static let shared = FontImport()
    private let limit = 8 * 1024 * 1024

    func read(_ url: URL) throws -> ImportedFont {
        let ext = url.pathExtension.lowercased()
        guard ext == "ttf" || ext == "otf" else { throw RenderFailure(message: "Choose a TTF or OTF font.") }
        if let bytes = try url.resourceValues(forKeys: [.fileSizeKey]).fileSize, bytes > limit {
            throw RenderFailure(message: "Choose a font up to 8 MiB.")
        }
        let bytes = try Data(contentsOf: url)
        guard !bytes.isEmpty, bytes.count <= limit else { throw RenderFailure(message: "Choose a font up to 8 MiB.") }
        guard let provider = CGDataProvider(data: bytes as CFData), CGFont(provider) != nil else {
            throw RenderFailure(message: "Cannot read this font. Choose a valid TTF or OTF file.")
        }
        try Task.checkCancellation()
        let id = "imported-" + UUID().uuidString.lowercased()
        let family = "Artifact Imported " + id.replacingOccurrences(of: "-", with: " ")
        let mime = ext == "ttf" ? "font/ttf" : "font/otf"
        return ImportedFont(reference: "artifact-font://" + id, asset: [
            "id": id,
            "dataUrl": "data:\(mime);base64," + bytes.base64EncodedString(),
            "mime": mime,
            "bytes": bytes.count,
            "label": url.deletingPathExtension().lastPathComponent,
            "family": family,
            "createdAt": ISO8601DateFormatter().string(from: Date()),
            "source": "local-file",
            "sourceName": url.lastPathComponent,
            "embeddingPolicy": "user-confirmed-required"
        ])
    }
}
