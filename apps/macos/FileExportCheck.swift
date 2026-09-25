import AppKit
import CoreGraphics
import Foundation
import ImageIO

@main struct FileExportCheck {
    static func require(_ value: Bool, _ message: String) { precondition(value, message) }

    static func bitmap(_ width: Int, _ height: Int) -> CGImage {
        let context = CGContext(data: nil, width: width, height: height, bitsPerComponent: 8,
            bytesPerRow: width * 4, space: CGColorSpace(name: CGColorSpace.sRGB)!,
            bitmapInfo: CGBitmapInfo.byteOrder32Big.rawValue | CGImageAlphaInfo.premultipliedLast.rawValue)!
        context.setFillColor(CGColor(srgbRed: 0.1, green: 0.7, blue: 0.9, alpha: 0.5))
        context.fill(CGRect(x: width / 2 - 10, y: height / 2 - 10, width: 20, height: 20))
        return context.makeImage()!
    }

    static func alpha(_ image: CGImage, x: Int, y: Int) -> UInt8 {
        let region = image.cropping(to: CGRect(x: x, y: y, width: 1, height: 1))!
        let context = CGContext(data: nil, width: 1, height: 1, bitsPerComponent: 8,
            bytesPerRow: 4, space: CGColorSpace(name: CGColorSpace.sRGB)!,
            bitmapInfo: CGBitmapInfo.byteOrder32Big.rawValue | CGImageAlphaInfo.premultipliedLast.rawValue)!
        context.draw(region, in: CGRect(x: 0, y: 0, width: 1, height: 1))
        return context.data!.assumingMemoryBound(to: UInt8.self)[3]
    }

    static func main() async throws {
        guard CommandLine.arguments.count == 3 else { fatalError("file-export-check FIXTURE OUTPUT-DIRECTORY") }
        let fixture = URL(fileURLWithPath: CommandLine.arguments[1])
        let output = URL(fileURLWithPath: CommandLine.arguments[2])
        try FileManager.default.createDirectory(at: output, withIntermediateDirectories: true)

        let original = try ProjectFileService.read(fixture)
        let source = try NativeSession.open(source: original.source).exportJson()
        let exported = output.appendingPathComponent("roundtrip.artifact")
        try ProjectFileService.write(source, to: exported)
        let reopened = try ProjectFileService.read(exported)
        require(try NativeSession.open(source: reopened.source).exportJson() == source, "Package roundtrip changed values")
        var rich = try JSONSerialization.jsonObject(with: Data(source.utf8)) as! [String: Any]
        var document = rich["document"] as! [String: Any]
        document["graph"] = ["edges": [["id": "unknown-edge", "fromId": "web-only", "toId": "__export__"]],
                             "unknownUtility": ["nested": [1, 2, 3]]]
        document["futureField"] = ["untouched": true]
        rich["document"] = document
        rich["futurePackageField"] = ["keep": "value"]
        let richSource = String(decoding: try JSONSerialization.data(withJSONObject: rich), as: UTF8.self)
        let richFile = output.appendingPathComponent("rich.artifact")
        try ProjectFileService.write(richSource, to: richFile)
        let richSession = try NativeSession.open(source: ProjectFileService.read(richFile).source)
        let richSaved = try richSession.exportJson()
        let richObject = try JSONSerialization.jsonObject(with: Data(richSaved.utf8)) as! [String: Any]
        let richDocument = richObject["document"] as! [String: Any]
        require((richDocument["futureField"] as? [String: Bool])?["untouched"] == true,
                "Unknown document data dropped")
        require((richObject["futurePackageField"] as? [String: String])?["keep"] == "value",
                "Unknown package data dropped")
        require((richDocument["graph"] as? [String: Any])?["unknownUtility"] != nil,
                "Unsupported graph data dropped")
        for invalid: Any in ["3", true, 2.5, 999] {
            var invalidDocument = document
            invalidDocument["schemaVersion"] = invalid
            var invalidPackage = rich
            invalidPackage["document"] = invalidDocument
            do {
                _ = try ProjectFileService.prepare(JSONSerialization.data(withJSONObject: invalidPackage))
                fatalError("Invalid schema accepted: \(invalid)")
            } catch {}
        }
        var legacyDocument = document
        legacyDocument.removeValue(forKey: "schemaVersion")
        legacyDocument.removeValue(forKey: "graph")
        require(try ProjectFileService.prepare(JSONSerialization.data(withJSONObject: legacyDocument))
                    .source.contains("\"schemaVersion\":3"), "Missing legacy schema was not migrated")
        if let fontAsset = (document["fontAssets"] as? [[String: Any]])?.first,
           let dataURL = fontAsset["dataUrl"] as? String,
           let encoded = dataURL.split(separator: ",").last,
           let fontBytes = Data(base64Encoded: String(encoded)) {
            let fontFile = output.appendingPathComponent("redistributable.ttf")
            try fontBytes.write(to: fontFile)
            let imported = try await FontImport.shared.read(fontFile)
            require((imported.asset["bytes"] as? Int) == fontBytes.count &&
                    (imported.asset["dataUrl"] as? String)?.hasPrefix("data:font/ttf;base64,") == true,
                    "Font import failed")
            let fontSession = try NativeSession.open(source: source)
            let beforeRevision = try fontSession.revision()
            try NativeCommandService.commit(fontSession, commands: [
                ["type": "edit_assets", "collection": "fontAssets", "upsert": [imported.asset]],
                ["type": "patch_layer", "id": "font-title", "patch": ["font": imported.reference]]
            ])
            require(try fontSession.revision() == beforeRevision + 1, "Font import took multiple history steps")
            var edited = try JSONSerialization.jsonObject(with: Data(fontSession.exportJson().utf8)) as! [String: Any]
            var editedDocument = edited["document"] as! [String: Any]
            require((editedDocument["fontAssets"] as? [[String: Any]])?.contains(where: {
                $0["id"] as? String == imported.asset["id"] as? String
            }) == true, "Imported font bytes missing")
            _ = try fontSession.undo()
            edited = try JSONSerialization.jsonObject(with: Data(fontSession.exportJson().utf8)) as! [String: Any]
            editedDocument = edited["document"] as! [String: Any]
            require((editedDocument["fontAssets"] as? [[String: Any]])?.count == 1,
                    "Font import undo did not restore assets")
            _ = try fontSession.redo()
            require(try fontSession.revision() == beforeRevision + 3, "Font import redo did not advance revision")
        } else { fatalError("Redistributable font fixture missing") }
        for (aspect, w, h) in [("1:1", 1000, 1000), ("4:5", 1080, 1350),
                               ("9:16", 1080, 1920), ("16:9", 1920, 1080)] {
            let base = bitmap(w, h)
            for scale in 1...3 {
                for format in NativeExportFormat.allCases {
                    let bytes = try NativeExportService.encode(base, scale: scale, format: format)
                    guard let imageSource = CGImageSourceCreateWithData(bytes as CFData, nil),
                          let decoded = CGImageSourceCreateImageAtIndex(imageSource, 0, nil) else {
                        fatalError("Cannot decode \(aspect) \(format) \(scale)x")
                    }
                    require(decoded.width == w * scale && decoded.height == h * scale,
                            "Wrong export dimensions: \(aspect) \(format) \(scale)x")
                    require(alpha(decoded, x: 0, y: 0) == (format == .png ? 0 : 255), "Wrong corner alpha")
                    let center = Int(alpha(decoded, x: decoded.width / 2, y: decoded.height / 2))
                    require(format == .png ? (125...130).contains(center) : center == 255, "Wrong center alpha")
                    if aspect == "4:5" && scale == 2 {
                        try bytes.write(to: output.appendingPathComponent("alpha-4x5-2x.\(format.extensionName)"))
                    }
                }
            }
        }
        do {
            _ = try ProjectFileService.prepare(Data("not json".utf8))
            fatalError("Invalid package accepted")
        } catch {}
        let blocked = output.appendingPathComponent("missing-parent/blocked.png")
        do {
            try ProjectFileService.writeExport(Data("keep".utf8), to: blocked)
            fatalError("Write failure accepted")
        } catch {}
        let draftURL = output.appendingPathComponent("recovery.artifact")
        try ProjectFileService.writeRecovery(source, drafts: [["id": "text", "valid": false]], to: draftURL)
        require(ProjectFileService.recoveryDrafts(at: draftURL, matching: source).count == 1, "Draft recovery missing")
        require(ProjectFileService.recoveryDrafts(at: draftURL, matching: source + "edit").isEmpty,
                "Stale inspector drafts were restored")
        try ProjectFileService.clearRecovery(at: draftURL)
        print("PASS: portable package/font roundtrip, unknown Web data, invalid/write failure/recovery guards")
        print("PASS: PNG/JPEG 1–3× dimensions and alpha for all four Web aspects")
    }
}
