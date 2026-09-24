import Foundation
@main struct RenderCheck {
    static func main() throws {
        let args = CommandLine.arguments
        if args.count == 3, args[1] == "--kernels" {
            var results: [String: [UInt8]] = [:]
            let input = Data((0..<256).map { UInt8(($0 * 17 + 31) % 256) })
            for key in ["glitch", "grain", "noiseWarp", "vortex", "tearAmt", "scanlines", "ca"] {
                let config = "{\"\(key)\":38,\"tearSize\":4,\"scanlineWidth\":4}"
                results[key] = Array(try renderEffect(pixels: input, width: 8, height: 8, layerJson: config, seed: 4242))
            }
            try JSONEncoder().encode(results).write(to: URL(fileURLWithPath: args[2]), options: .atomic)
            return
        }
        guard args.count >= 4 else { fatalError("render-check INPUT OUTPUT WIDTH[xHEIGHT] [DIAGNOSTICS]") }
        let parts = args[3].split(separator: "x")
        guard let width = UInt32(parts.first ?? ""),
              let height = parts.count == 2 ? UInt32(parts[1]) : width
        else { fatalError("render-check INPUT OUTPUT WIDTH[xHEIGHT] [DIAGNOSTICS]") }
        let source = try String(contentsOfFile: args[1], encoding: .utf8)
        let session = try NativeSession.open(source: source)
        let plan = try session.renderPlanJson(width: width, height: height)
        let start = Date()
        let diagnostics = args.count > 4 ? URL(fileURLWithPath: args[4]) : nil
        if let diagnostics { try FileManager.default.createDirectory(at: diagnostics, withIntermediateDirectories: true) }
        let image = try PilotRenderer(planJSON: plan).render(diagnostics: diagnostics)
        try PilotRenderer.writePNG(image, to: URL(fileURLWithPath: args[2]))
        print("Rendered \(width)×\(height) in \(Date().timeIntervalSince(start)) seconds")
    }
}
