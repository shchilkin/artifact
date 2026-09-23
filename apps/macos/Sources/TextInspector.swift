import SwiftUI

private struct TextDraft {
    var content: String
    var size: String
    var color: String
    var x: String
    var y: String

    init(_ value: TextProperties) {
        content = value.content; size = String(value.size); color = value.color
        x = String(value.x * 100); y = String(value.y * 100)
    }

    func patch(from value: TextProperties) -> [String: Any] {
        let original = TextDraft(value)
        var patch: [String: Any] = [:]
        if content != original.content { patch["content"] = content }
        if color != original.color { patch["color"] = color }
        if size != original.size { patch["size"] = Double(size) }
        if x != original.x { patch["x"] = Double(x).map { $0 / 100 } }
        if y != original.y { patch["y"] = Double(y).map { $0 / 100 } }
        return patch
    }

    var isValid: Bool {
        guard let size = Double(size), let x = Double(x), let y = Double(y),
              size.isFinite, x.isFinite, y.isFinite else { return false }
        return (1...540).contains(size) && (-200...300).contains(x) && (-200...300).contains(y)
            && color.range(of: "^#[0-9a-fA-F]{6}$", options: .regularExpression) != nil
            && content.utf8.count <= 16_384 && !content.contains("\0")
    }
}

struct TextInspector: View {
    let value: TextProperties
    let onApply: ([String: Any]) -> Void
    @State private var draft: TextDraft

    init(value: TextProperties, onApply: @escaping ([String: Any]) -> Void) {
        self.value = value; self.onApply = onApply
        _draft = State(initialValue: TextDraft(value))
    }

    var body: some View {
        Form {
            TextField("Text", text: $draft.content, axis: .vertical).lineLimit(2...3)
                .accessibilityIdentifier("text-content")
            TextField("Size", text: $draft.size).accessibilityIdentifier("text-size")
            TextField("Color (#RRGGBB)", text: $draft.color).accessibilityIdentifier("text-color")
            TextField("X (%)", text: $draft.x).accessibilityIdentifier("text-x")
            TextField("Y (%)", text: $draft.y).accessibilityIdentifier("text-y")
            Button("Apply text") { onApply(draft.patch(from: value)) }
                .disabled(!draft.isValid || draft.patch(from: value).isEmpty)
        }
        .formStyle(.grouped)
        .frame(maxWidth: 480, minHeight: 280, maxHeight: 300)
        .onChange(of: value) { _, newValue in draft = TextDraft(newValue) }
    }
}
