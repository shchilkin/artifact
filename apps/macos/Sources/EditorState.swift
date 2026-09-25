import Foundation

struct EditorLayer: Identifiable {
    let raw: [String: Any]
    var id: String { string("id") }
    var name: String { string("name", string("kind")) }
    var kind: String { string("kind") }
    var visible: Bool { raw["visible"] as? Bool ?? true }
    var locked: Bool { raw["locked"] as? Bool ?? false }
    var movable: Bool { kind == "text" || kind == "image" }
    func string(_ key: String, _ fallback: String = "") -> String { raw[key] as? String ?? fallback }
    func number(_ key: String, _ fallback: Double = 0) -> Double { (raw[key] as? NSNumber)?.doubleValue ?? fallback }
}
struct EditorEdge: Identifiable {
    let id: String
    let from: String
    let to: String
}
struct EditorArea: Identifiable {
    let id: String
    let name: String
    let color: String
    let nodeIDs: [String]
    let collapsed: Bool
}
struct EditorState {
    var layers: [EditorLayer] = []
    var order: [String] = []
    var edges: [EditorEdge] = []
    var areas: [EditorArea] = []
    var positions: [String: CGPoint] = [:]
    var fonts: [(id: String, name: String)] = []
    var canReorder = false
    var graphEditable = false
    init() {}
    init(json: String) throws {
        guard let value = try JSONSerialization.jsonObject(with: Data(json.utf8)) as? [String: Any] else { throw CocoaError(.fileReadCorruptFile) }
        layers = (value["layers"] as? [[String: Any]] ?? []).map { EditorLayer(raw: $0) }
        order = value["order"] as? [String] ?? []
        canReorder = value["canReorder"] as? Bool ?? false
        graphEditable = value["graphEditable"] as? Bool ?? false
        let graph = value["graph"] as? [String: Any] ?? [:]
        areas = (graph["areas"] as? [[String: Any]] ?? []).compactMap { item in
            guard let id = item["id"] as? String, let name = item["name"] as? String else { return nil }
            return EditorArea(id: id, name: name, color: item["color"] as? String ?? "#999999",
                nodeIDs: item["nodeIds"] as? [String] ?? [], collapsed: item["collapsed"] as? Bool ?? false)
        }
        edges = (graph["edges"] as? [[String: Any]] ?? []).compactMap {
            guard let id = $0["id"] as? String, let from = $0["fromId"] as? String, let to = $0["toId"] as? String else { return nil }
            return EditorEdge(id: id, from: from, to: to)
        }
        for (id, point) in graph["positions"] as? [String: [String: Double]] ?? [:] {
            if let x = point["x"], let y = point["y"] { positions[id] = CGPoint(x: x, y: y) }
        }
        fonts = (value["fonts"] as? [[String: String]] ?? []).compactMap {
            guard let id = $0["id"], let name = $0["name"] else { return nil }; return (id, name)
        }
    }
    var orderedLayers: [EditorLayer] {
        let ordered = order.compactMap { id in layers.first { $0.id == id } }
        return ordered + layers.filter { !order.contains($0.id) }
    }
    func position(_ id: String) -> CGPoint {
        if let point = positions[id] { return point }
        let index = orderedLayers.firstIndex { $0.id == id } ?? layers.count
        return CGPoint(x: 80 + index * 250, y: 160)
    }
}
