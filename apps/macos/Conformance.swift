import Foundation

@main
struct Conformance {
    static func main() throws {
        let args = CommandLine.arguments
        guard (4...6).contains(args.count) else { fatalError("usage: conformance INPUT LAYER_ID OUTPUT [PATCH_FILE] [image]") }
        let session = try NativeSession.open(source: String(contentsOfFile: args[1], encoding: .utf8))
        let opened = try session.exportJson()
        var steps = 1
        if args.count == 6 && args[5] == "editor" {
            let commands = try JSONSerialization.jsonObject(with: Data(contentsOf: URL(fileURLWithPath: args[4]))) as! [[String: Any]]
            steps = 0
            for command in commands {
                let data = try JSONSerialization.data(withJSONObject: command, options: [.sortedKeys, .withoutEscapingSlashes])
                if try session.execute(commandJson: String(decoding: data, as: UTF8.self)) { steps += 1 }
            }
        } else if args.count == 6 && args[5] == "image" {
            _ = try session.setImage(layerId: args[2], patchJson: String(contentsOfFile: args[4], encoding: .utf8))
        } else if args.count == 5 {
            _ = try session.setText(layerId: args[2], patchJson: String(contentsOfFile: args[4], encoding: .utf8))
        } else {
            _ = try session.setScanlines(layerId: args[2], amount: 50)
        }
        let changed = try session.exportJson()
        for _ in 0..<steps { let changed = try session.undo(); precondition(changed) }
        let undone = try session.exportJson()
        for _ in 0..<steps { let changed = try session.redo(); precondition(changed) }
        let redone = try session.exportJson()
        let reopened = try NativeSession.open(source: redone).exportJson()
        let output = ["opened": opened, "changed": changed, "undone": undone, "redone": redone, "reopened": reopened]
        try JSONEncoder().encode(output).write(to: URL(fileURLWithPath: args[3]), options: .atomic)
        print("Swift/UniFFI command sequence complete")
    }
}
