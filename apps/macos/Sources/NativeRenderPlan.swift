import Foundation

// A transient projection of the shared-core plan. It never enters CanvasDocument.
struct NativeRenderPlan {
    struct Input {
        let port: String
        let sourceId: String
    }
    struct Node {
        let id: String
        let kind: String
        let config: [String: Any]
        let inputs: [Input]
        let cacheKey: String
    }
    let version: Int
    let mode: String
    let targetId: String
    let width: Int
    let height: Int
    let seed: UInt32
    let background: String
    let layers: [[String: Any]]
    let fontAssets: [[String: Any]]
    let nodes: [Node]

    private init(version: Int, mode: String, targetId: String, width: Int, height: Int,
                 seed: UInt32, background: String, layers: [[String: Any]], fontAssets: [[String: Any]],
                 nodes: [Node]) {
        self.version = version; self.mode = mode; self.targetId = targetId
        self.width = width; self.height = height; self.seed = seed; self.background = background
        self.layers = layers; self.fontAssets = fontAssets; self.nodes = nodes
    }

    func singleLayer(_ layer: [String: Any]) -> NativeRenderPlan {
        NativeRenderPlan(version: 2, mode: "stack", targetId: "__export__", width: width, height: height,
                         seed: seed, background: "transparent", layers: [layer], fontAssets: fontAssets, nodes: [])
    }

    init(json: String) throws {
        guard let value = try JSONSerialization.jsonObject(with: Data(json.utf8)) as? [String: Any],
              let width = value["width"] as? Int, let height = value["height"] as? Int,
              (1...3000).contains(width), (1...3000).contains(height),
              let layers = value["layers"] as? [[String: Any]],
              let background = value["background"] as? String
        else { throw RenderFailure(message: "Invalid render plan") }
        self.width = width
        self.height = height
        self.version = value["version"] as? Int ?? 1
        self.mode = value["mode"] as? String ?? "stack"
        self.targetId = value["targetId"] as? String ?? "__export__"
        self.seed = (value["seed"] as? NSNumber)?.uint32Value ?? 0
        self.background = background
        self.layers = layers
        self.fontAssets = value["fontAssets"] as? [[String: Any]] ?? []
        let rawNodes = value["nodes"] as? [[String: Any]] ?? []
        self.nodes = try rawNodes.map { raw in
            guard let id = raw["id"] as? String, let kind = raw["kind"] as? String,
                  let config = raw["config"] as? [String: Any], let cacheKey = raw["cacheKey"] as? String,
                  let rawInputs = raw["inputs"] as? [[String: Any]] else {
                throw RenderFailure(message: "Invalid graph render node")
            }
            let inputs = try rawInputs.map { edge -> Input in
                guard let port = edge["port"] as? String, let sourceId = edge["sourceId"] as? String else {
                    throw RenderFailure(message: "Invalid graph render input")
                }
                return Input(port: port, sourceId: sourceId)
            }
            return Node(id: id, kind: kind, config: config, inputs: inputs, cacheKey: cacheKey)
        }
        if mode == "graph" && (version != 2 || nodes.isEmpty || nodes.last?.id != targetId) {
            throw RenderFailure(message: "Invalid graph render plan")
        }
    }
}

struct NativeCanvasDimensions: Equatable {
    let width: UInt32
    let height: UInt32

    static func base(_ aspect: String) -> Self {
        switch aspect {
        case "4:5": return Self(width: 1080, height: 1350)
        case "9:16": return Self(width: 1080, height: 1920)
        case "16:9": return Self(width: 1920, height: 1080)
        default: return Self(width: 1000, height: 1000)
        }
    }

    func fit(maxSide: UInt32) -> Self {
        let divisor = Double(max(width, height))
        return Self(width: max(1, UInt32((Double(width) * Double(maxSide) / divisor).rounded())),
                    height: max(1, UInt32((Double(height) * Double(maxSide) / divisor).rounded())))
    }
}
