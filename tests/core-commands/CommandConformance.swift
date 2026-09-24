import Foundation

func encoded(_ object: Any) throws -> String {
    let data = try JSONSerialization.data(withJSONObject: object, options: [.sortedKeys, .withoutEscapingSlashes])
    return String(decoding: data, as: UTF8.self)
}

@main
struct CommandConformance {
    static func main() throws {
        let args = CommandLine.arguments
        guard args.count == 4 else { fatalError("usage: command_conformance INPUT COMMANDS OUTPUT") }
        let source = try String(contentsOfFile: args[1], encoding: .utf8)
        let commands = try JSONSerialization.jsonObject(with: Data(contentsOf: URL(fileURLWithPath: args[2])))
        let session = try NativeSession.open(source: source)
        let opened = try session.exportJson()
        let begin = try session.beginTransactionJson(request: encoded(["version": 1, "expectedRevision": 0]))
        let update = try session.updateTransactionJson(request: encoded(["version": 1, "transactionId": 1, "commands": commands]))
        let draft = try session.exportJson()
        let commit = try session.commitTransactionJson(request: encoded(["version": 1, "transactionId": 1]))
        let committed = try session.exportJson()
        let didUndo = try session.undo()
        precondition(didUndo)
        let undone = try session.exportJson()
        let didRedo = try session.redo()
        precondition(didRedo)
        let redone = try session.exportJson()
        let reopened = try NativeSession.open(source: session.exportDurableJson()).exportJson()
        let stale = try session.cancelTransactionJson(request: encoded(["version": 1, "transactionId": 1]))
        let commandList = commands as! [[String: Any]]
        let first = commandList[0]["id"] as! String
        let package = try JSONSerialization.jsonObject(with: Data(source.utf8)) as! [String: Any]
        let document = package["document"] as! [String: Any]
        let global = document["global"] as! [String: Any]
        let seed = global["seed"] as! Int
        let cancelBegin = try session.beginTransactionJson(request: encoded(["version": 1, "expectedRevision": try session.revision()]))
        let cancelUpdate = try session.updateTransactionJson(request: encoded(["version": 1, "transactionId": 2,
            "commands": [["type": "patch_global", "patch": ["seed": seed + 2]]]]))
        let cancelDraft = try session.exportJson()
        let failed = try session.updateTransactionJson(request: encoded(["version": 1, "transactionId": 2,
            "commands": [
                ["type": "bridge", "capability": "web:layer-property",
                 "target": ["scope": "layer_field", "id": first, "field": "cancelledNull"], "value": NSNull()],
                ["type": "patch_global", "patch": ["aspect": "invalid"]],
            ]]))
        let failedDraft = try session.exportJson()
        let cancel = try session.cancelTransactionJson(request: encoded(["version": 1, "transactionId": 2]))
        let cancelled = try session.exportJson()
        let legacyCommand = try encoded(["type": "edit_layer", "id": first, "patch": ["name": "P03 legacy"]])
        let didLegacyEdit = try session.execute(commandJson: legacyCommand)
        precondition(didLegacyEdit)
        let legacy = try session.exportJson()
        let mixedBegin = try session.beginTransactionJson(request: encoded(["version": 1, "expectedRevision": try session.revision()]))
        let mixedUpdate = try session.updateTransactionJson(request: encoded(["version": 1, "transactionId": 3,
            "commands": [["type": "patch_global", "patch": ["seed": seed + 3]]]]))
        let mixedCommit = try session.commitTransactionJson(request: encoded(["version": 1, "transactionId": 3]))
        let mixedAfter = try session.exportJson()
        let mixedDidUndoTransaction = try session.undo()
        precondition(mixedDidUndoTransaction)
        let mixedUndoTransaction = try session.exportJson()
        let mixedDidUndoLegacy = try session.undo()
        precondition(mixedDidUndoLegacy)
        let mixedUndoLegacy = try session.exportJson()
        let mixedDidRedoLegacy = try session.redo()
        precondition(mixedDidRedoLegacy)
        let mixedRedoLegacy = try session.exportJson()
        let mixedDidRedoTransaction = try session.redo()
        precondition(mixedDidRedoTransaction)
        let mixedRedoTransaction = try session.exportJson()
        let output: [String: String] = ["opened": opened, "begin": begin, "update": update, "draft": draft,
                                         "commit": commit, "committed": committed, "undone": undone,
                                         "redone": redone, "reopened": reopened, "stale": stale,
                                         "cancelBegin": cancelBegin, "cancelUpdate": cancelUpdate, "cancelDraft": cancelDraft,
                                         "failed": failed, "failedDraft": failedDraft, "cancel": cancel, "cancelled": cancelled,
                                         "legacy": legacy, "mixedBegin": mixedBegin, "mixedUpdate": mixedUpdate,
                                         "mixedCommit": mixedCommit, "mixedAfter": mixedAfter,
                                         "mixedUndoTransaction": mixedUndoTransaction, "mixedUndoLegacy": mixedUndoLegacy,
                                         "mixedRedoLegacy": mixedRedoLegacy, "mixedRedoTransaction": mixedRedoTransaction]
        try JSONSerialization.data(withJSONObject: output, options: [.sortedKeys, .withoutEscapingSlashes])
            .write(to: URL(fileURLWithPath: args[3]), options: .atomic)
    }
}
