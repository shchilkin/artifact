import Foundation

// A transient projection of the shared-core plan. It never enters CanvasDocument.
struct NativeRenderPlan {
    let width: Int
    let height: Int
    let seed: UInt32
    let background: String
    let layers: [[String: Any]]
    let fontAssets: [[String: Any]]

    init(json: String) throws {
        guard let value = try JSONSerialization.jsonObject(with: Data(json.utf8)) as? [String: Any],
              let width = value["width"] as? Int, let height = value["height"] as? Int,
              (1...3000).contains(width), (1...3000).contains(height),
              let layers = value["layers"] as? [[String: Any]],
              let background = value["background"] as? String
        else { throw RenderFailure(message: "Invalid render plan") }
        self.width = width
        self.height = height
        self.seed = (value["seed"] as? NSNumber)?.uint32Value ?? 0
        self.background = background
        self.layers = layers
        self.fontAssets = value["fontAssets"] as? [[String: Any]] ?? []
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
