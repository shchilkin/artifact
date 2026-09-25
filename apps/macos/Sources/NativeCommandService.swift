import Foundation

// Coarse, serializable command adapter shared by file/asset workflows and P08.
enum NativeCommandService {
    static func begin(_ session: NativeSession) throws -> UInt64 {
        let reply = try decode(session.beginTransactionJson(request: json([
            "version": 1, "expectedRevision": try session.revision()
        ])))
        guard let id = reply["transactionId"] as? UInt64 ?? (reply["transactionId"] as? NSNumber)?.uint64Value else {
            throw RenderFailure(message: "Could not begin document edit.")
        }
        return id
    }

    static func update(_ session: NativeSession, id: UInt64, commands: [[String: Any]]) throws {
        _ = try decode(session.updateTransactionJson(request: json([
            "version": 1, "transactionId": id, "commands": commands
        ])))
    }

    static func finish(_ session: NativeSession, id: UInt64, commit: Bool) throws {
        let request = try json(["version": 1, "transactionId": id])
        _ = try decode(commit ? session.commitTransactionJson(request: request)
                              : session.cancelTransactionJson(request: request))
    }

    static func commit(_ session: NativeSession, commands: [[String: Any]]) throws {
        let id = try begin(session)
        do {
            for command in commands { try update(session, id: id, commands: [command]) }
            try finish(session, id: id, commit: true)
        } catch {
            try? finish(session, id: id, commit: false)
            throw error
        }
    }

    private static func requireSuccess(_ response: [String: Any]) throws {
        guard response["ok"] as? Bool == true else {
            let error = response["error"] as? [String: Any]
            throw RenderFailure(message: error?["message"] as? String ?? "Document edit was rejected.")
        }
    }

    private static func json(_ value: [String: Any]) throws -> String {
        String(decoding: try JSONSerialization.data(withJSONObject: value, options: [.withoutEscapingSlashes]), as: UTF8.self)
    }

    private static func decode(_ value: String) throws -> [String: Any] {
        guard let result = try JSONSerialization.jsonObject(with: Data(value.utf8)) as? [String: Any] else {
            throw RenderFailure(message: "Invalid document edit response.")
        }
        try requireSuccess(result)
        return result
    }
}
