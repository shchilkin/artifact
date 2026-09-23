import Foundation

@main
struct Conformance {
    static func main() throws {
        let args = CommandLine.arguments
        guard (4...6).contains(args.count) else { fatalError("usage: conformance INPUT LAYER_ID OUTPUT [PATCH_FILE] [image]") }
        let session = try NativeSession.open(source: String(contentsOfFile: args[1], encoding: .utf8))
        let opened = try session.exportJson()
        if args.count == 6 && args[5] == "image" {
            _ = try session.setImage(layerId: args[2], patchJson: String(contentsOfFile: args[4], encoding: .utf8))
        } else if args.count == 5 {
            _ = try session.setText(layerId: args[2], patchJson: String(contentsOfFile: args[4], encoding: .utf8))
        } else {
            _ = try session.setScanlines(layerId: args[2], amount: 50)
        }
        let changed = try session.exportJson()
        let didUndo = try session.undo()
        precondition(didUndo)
        let undone = try session.exportJson()
        let didRedo = try session.redo()
        precondition(didRedo)
        let redone = try session.exportJson()
        let reopened = try NativeSession.open(source: redone).exportJson()
        let output = ["opened": opened, "changed": changed, "undone": undone, "redone": redone, "reopened": reopened]
        try JSONEncoder().encode(output).write(to: URL(fileURLWithPath: args[3]), options: .atomic)
        print("Swift/UniFFI command sequence complete")
    }
}
