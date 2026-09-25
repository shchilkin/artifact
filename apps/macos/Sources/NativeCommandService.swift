import Foundation

// Coarse, serializable command adapter shared by file/asset workflows and P08.
enum NativeCommandService {
    static func commit(_ session: NativeSession, commands: [[String: Any]]) throws {
        let begin = try decode(session.beginTransactionJson(request: json([
            "version": 1, "expectedRevision": try session.revision()
        ])))
        guard let id = begin["transactionId"] as? UInt64 ?? (begin["transactionId"] as? NSNumber)?.uint64Value else {
            throw RenderFailure(message: "Could not begin document edit.")
        }
        do {
            for command in commands {
                let reply = try decode(session.updateTransactionJson(request: json([
                    "version": 1, "transactionId": id, "commands": [command]
                ])))
                try requireSuccess(reply)
            }
            let reply = try decode(session.commitTransactionJson(request: json([
                "version": 1, "transactionId": id
            ])))
            try requireSuccess(reply)
        } catch {
            _ = try? session.cancelTransactionJson(request: json(["version": 1, "transactionId": id]))
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
