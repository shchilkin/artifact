import CoreFoundation
import CryptoKit
import Foundation

struct OpenedProject {
    let source: String
    let notice: String?
}

// File and compatibility rules live outside SwiftUI. Unknown JSON values in a
// current package pass through to the shared session unchanged.
enum ProjectFileService {
    static let packageLimit = 64 * 1024 * 1024

    static func read(_ url: URL) throws -> OpenedProject {
        let values = try url.resourceValues(forKeys: [.fileSizeKey])
        if let size = values.fileSize, size > packageLimit { throw CocoaError(.fileReadTooLarge) }
        let data = try Data(contentsOf: url)
        guard data.count <= packageLimit else { throw CocoaError(.fileReadTooLarge) }
        return try prepare(data)
    }

    static func prepare(_ data: Data) throws -> OpenedProject {
        guard data.count <= packageLimit else { throw CocoaError(.fileReadTooLarge) }
        guard let root = try JSONSerialization.jsonObject(with: data) as? [String: Any] else {
            throw RenderFailure(message: "This file is not an Artifact project.")
        }
        let isPackage = root["artifactPackage"] as? String == "project"
        if root["artifactPackage"] != nil && !isPackage {
            throw RenderFailure(message: "This package type is not supported.")
        }
        let rawDocument = isPackage ? root["document"] as? [String: Any] : root
        guard var document = rawDocument, document["global"] is [String: Any], document["layers"] is [Any] else {
            throw RenderFailure(message: "Project document is incomplete.")
        }
        let schema: Int
        if let rawSchema = document["schemaVersion"] {
            guard let number = rawSchema as? NSNumber,
                  CFGetTypeID(number) != CFBooleanGetTypeID(),
                  number.doubleValue.isFinite,
                  number.doubleValue.rounded() == number.doubleValue,
                  number.doubleValue >= 1,
                  number.doubleValue <= Double(Int.max) else {
                throw RenderFailure(message: "Invalid document schema version.")
            }
            schema = number.intValue
        } else { schema = 1 }
        guard (1...3).contains(schema) else {
            throw RenderFailure(message: "This document schema is not supported. Open it in the current Web editor.")
        }
        if schema < 3 {
            // Web migrations of graph shaders can rewrite authored nodes. Do
            // not approximate those migrations or discard richer data here.
            if document["graph"] is [String: Any] {
                throw RenderFailure(message: "Open this older graph project in the Web editor to migrate it, then save a new .artifact file.")
            }
            document["schemaVersion"] = 3
            if document["export"] == nil { document["export"] = ["format": "png", "scale": 1] }
            var global = document["global"] as! [String: Any]
            if global["aspect"] == nil { global["aspect"] = "1:1" }
            if global["bg"] == nil { global["bg"] = "transparent" }
            document["global"] = global
        }
        var package = root
        if !isPackage {
            let embedsFonts = !(document["fontAssets"] as? [[String: Any]] ?? []).isEmpty
            package = ["artifactPackage": "project", "manifest": [
                "kind": "artifact-project-package", "version": 1, "documentSchemaVersion": 3,
                "fontEmbeddingMode": embedsFonts ? "explicit-font-files" : "metadata-only"
            ], "document": document]
        } else if schema < 3 {
            package["document"] = document
            var manifest = package["manifest"] as? [String: Any] ?? [:]
            manifest["documentSchemaVersion"] = 3
            package["manifest"] = manifest
        }
        let source = if isPackage && schema == 3 { String(decoding: data, as: UTF8.self) }
            else { String(decoding: try JSONSerialization.data(withJSONObject: package, options: [.sortedKeys, .withoutEscapingSlashes]), as: UTF8.self) }
        let notice = dependencyNotice(document)
        return OpenedProject(source: source, notice: notice)
    }

    static func write(_ source: String, to url: URL) throws {
        let bytes = Data(source.utf8)
        guard bytes.count <= packageLimit else { throw CocoaError(.fileWriteOutOfSpace) }
        try bytes.write(to: url, options: .atomic)
    }

    static func writeExport(_ data: Data, to url: URL) throws {
        try data.write(to: url, options: .atomic)
    }

    static func writeRecovery(_ source: String, drafts: [[String: Any]], to url: URL) throws {
        try FileManager.default.createDirectory(at: url.deletingLastPathComponent(), withIntermediateDirectories: true)
        try write(source, to: url)
        let wrapper: [String: Any] = [
            "documentHash": digest(source), "drafts": drafts
        ]
        let data = try JSONSerialization.data(withJSONObject: wrapper, options: [.sortedKeys])
        try data.write(to: draftsURL(for: url), options: .atomic)
    }

    static func recoveryDrafts(at url: URL, matching source: String) -> [[String: Any]] {
        guard let data = try? Data(contentsOf: draftsURL(for: url)),
              let wrapper = try? JSONSerialization.jsonObject(with: data) as? [String: Any],
              wrapper["documentHash"] as? String == digest(source) else { return [] }
        return wrapper["drafts"] as? [[String: Any]] ?? []
    }

    static func clearRecovery(at url: URL) throws {
        for file in [url, draftsURL(for: url)] where FileManager.default.fileExists(atPath: file.path) {
            try FileManager.default.removeItem(at: file)
        }
    }

    private static func draftsURL(for url: URL) -> URL {
        url.deletingPathExtension().appendingPathExtension("inspectors.json")
    }

    private static func digest(_ source: String) -> String {
        SHA256.hash(data: Data(source.utf8)).map { String(format: "%02x", $0) }.joined()
    }

    static func dependencyNotice(_ document: [String: Any]) -> String? {
        let layers = document["layers"] as? [[String: Any]] ?? []
        let fonts = document["fontAssets"] as? [[String: Any]] ?? []
        let validFontIDs = Set(fonts.compactMap { asset -> String? in
            guard let id = asset["id"] as? String, let dataURL = asset["dataUrl"] as? String,
                  dataURL.hasPrefix("data:font/") && dataURL.contains(";base64,") else { return nil }
            return id
        })
        var issues: [String] = []
        for layer in layers {
            if layer["kind"] as? String == "image", let src = layer["src"] as? String {
                if src.hasPrefix("artifact-asset://") || src.isEmpty {
                    issues.append("an image needs its original file")
                } else if src.hasPrefix("data:") && !src.contains(";base64,") {
                    issues.append("an image payload is invalid")
                }
            }
            if layer["kind"] as? String == "text", let font = layer["font"] as? String,
               font.hasPrefix("artifact-font://"), !validFontIDs.contains(String(font.dropFirst("artifact-font://".count))) {
                issues.append("an imported font is missing")
            }
        }
        return issues.isEmpty ? nil : "Project opened, but " + Array(Set(issues)).sorted().joined(separator: " and ") + ". Replace it before export."
    }
}
