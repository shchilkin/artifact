import SwiftUI
import UniformTypeIdentifiers

private struct ImageField {
    let key: String
    let label: String
    let factor: Double
    let range: ClosedRange<Double>
}
private let imageFields = [
    ImageField(key: "x", label: "X (%)", factor: 100, range: -200...300),
    ImageField(key: "y", label: "Y (%)", factor: 100, range: -200...300),
    ImageField(key: "scaleX", label: "Scale X (%)", factor: 100, range: 1...1000),
    ImageField(key: "scaleY", label: "Scale Y (%)", factor: 100, range: 1...1000),
    ImageField(key: "rotation", label: "Rotation (°)", factor: 1, range: -360...360)
]

struct ImageInspector: View {
    let value: ImageProperties
    let onApply: ([String: Any]) -> Void
    @State private var draft: [String: String]
    @State private var replacement: String?
    @State private var replacementName = ""
    @State private var message: String?
    @State private var isReading = false
    @State private var importTask: Task<Void, Never>?

    private static func strings(_ value: ImageProperties) -> [String: String] {
        ["x": String(value.x * 100), "y": String(value.y * 100),
         "scaleX": String(value.scaleX * 100), "scaleY": String(value.scaleY * 100),
         "rotation": String(value.rotation)]
    }
    init(value: ImageProperties, onApply: @escaping ([String: Any]) -> Void) {
        self.value = value; self.onApply = onApply
        _draft = State(initialValue: Self.strings(value))
    }
    private var patch: [String: Any] {
        let original = Self.strings(value)
        var result: [String: Any] = [:]
        for field in imageFields where draft[field.key] != original[field.key] {
            result[field.key] = Double(draft[field.key] ?? "").map { $0 / field.factor }
        }
        if let replacement { result["src"] = replacement }
        return result
    }
    private var valid: Bool {
        imageFields.allSatisfy { field in
            guard let number = Double(draft[field.key] ?? "") else { return false }
            return number.isFinite && field.range.contains(number)
        }
    }
    private func choose() {
        let panel = NSOpenPanel()
        panel.allowedContentTypes = [.png, .jpeg]
        panel.allowsMultipleSelection = false
        guard panel.runModal() == .OK, let url = panel.url else { return }
        replacement = nil; message = nil; isReading = true
        importTask?.cancel()
        importTask = Task {
            do {
                let src = try await ImageImport.shared.read(url)
                guard !Task.isCancelled else { return }
                replacement = src; replacementName = url.lastPathComponent
            } catch {
                guard !Task.isCancelled else { return }
                message = error.localizedDescription
            }
            isReading = false
        }
    }
    var body: some View {
        Form {
            Button("Replace image…", action: choose).disabled(isReading)
            if isReading { ProgressView("Reading image…") }
            if replacement != nil {
                Text("Ready to apply: \(replacementName)").lineLimit(1)
                Button("Cancel replacement") { replacement = nil }
            }
            ForEach(imageFields, id: \.key) { field in
                TextField(field.label, text: Binding(get: { draft[field.key] ?? "" }, set: { draft[field.key] = $0 }))
                    .accessibilityIdentifier("image-\(field.key)")
            }
            Button("Apply image") { onApply(patch) }.disabled(!valid || patch.isEmpty || isReading)
            if let message { Text(message).foregroundStyle(.red) }
        }
        .formStyle(.grouped)
        .frame(maxWidth: 480, minHeight: 300, maxHeight: 360)
        .onDisappear { importTask?.cancel() }
    }
}
