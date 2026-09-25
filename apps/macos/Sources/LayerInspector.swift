import SwiftUI
import UniformTypeIdentifiers

struct LayerInspector: View {
    @ObservedObject var model: ProjectModel
    let layer: EditorLayer
    @State private var draft: [String: String] = [:]
    @State private var replacement: String?
    @State private var replacementName = ""
    @State private var importing = false
    @State private var importError: String?
    @State private var importTask: Task<Void, Never>?
    @State private var pendingFontURL: URL?
    @FocusState private var focusedKey: String?

    private var originals: [String: String] {
        let current = model.inspectorOriginal(layer.id) ?? layer
        var result = ["name": current.name]
        for key in stringKeys { result[key] = current.string(key, key == "align" ? "center" : key == "fit" ? "contain" : "#ffffff") }
        if current.kind == "emoji" { result["emojis"] = (current.raw["emojis"] as? [String] ?? []).joined(separator: " ") }
        for field in numberFields { result[field.key] = String(current.number(field.key, field.fallback) * field.factor) }
        return result
    }
    private var stringKeys: [String] {
        switch layer.kind {
        case "text": return ["content", "color", "font", "align"]
        case "fill": return ["color"]
        case "image": return ["fit"]
        default: return []
        }
    }
    private var numberFields: [PropertyField] {
        var result: [PropertyField] = layer.kind == "effect" ? [] : [PropertyField("opacity", "Opacity (%)", 0...100, fallback: 100)]
        if layer.movable {
            result += [PropertyField("x", "X (%)", -200...300, factor: 100), PropertyField("y", "Y (%)", -200...300, factor: 100),
                PropertyField("scaleX", "Scale X (%)", 1...1000, factor: 100, fallback: 1), PropertyField("scaleY", "Scale Y (%)", 1...1000, factor: 100, fallback: 1), PropertyField("rotation", "Rotation (°)", -360...360)]
        }
        if layer.kind == "text" { result.insert(PropertyField("size", "Size", 1...540, fallback: 74), at: 0) }
        if layer.kind == "emoji" { result += [PropertyField("density", "Count", 0...1000, fallback: 30), PropertyField("minSz", "Minimum size", 1...540, fallback: 24), PropertyField("maxSz", "Maximum size", 1...540, fallback: 72), PropertyField("seedOffset", "Variation", 0...4294967295)] }
        if layer.kind == "effect" {
            result = [("glitch","Glitch"),("grain","Grain"),("noiseWarp","Noise warp"),("vortex","Vortex"),("tearAmt","Tear"),("scanlines","Scanlines"),("ca","Chromatic aberration")].map { PropertyField($0.0,$0.1,0...100) }
            result += [PropertyField("tearSize", "Tear size", 0.01...100, fallback: 4),PropertyField("scanlineWidth", "Scanline width", 0.01...100, fallback: 4)]
        }
        return result
    }
    private func patch(for values: [String: String]) -> [String: Any] {
        var result: [String: Any] = [:]
        for (key, value) in values where value != originals[key] {
            if let field = numberFields.first(where: { $0.key == key }) { result[key] = Double(value).map { $0 / field.factor } }
            else if key == "emojis" { result[key] = value.split(whereSeparator: \.isWhitespace).map(String.init) }
            else { result[key] = value }
        }
        if let replacement { result["src"] = replacement }
        return result
    }
    private func valid(_ values: [String: String]) -> Bool {
        !values.isEmpty && !(values["name"] ?? "").trimmingCharacters(in: .whitespaces).isEmpty
            && numberFields.allSatisfy { field in Double(values[field.key] ?? "").map { $0.isFinite && field.range.contains($0) } ?? false }
            && (values["color"].map { $0.range(of: "^#[0-9a-fA-F]{6}$", options: .regularExpression) != nil } ?? true)
            && (values["align"].map { ["left", "center", "right"].contains($0) } ?? true)
            && (values["fit"].map { ["contain", "cover", "free", "tile"].contains($0) } ?? true)
    }
    private func stage(commitWhenUnfocused key: String? = nil) {
        model.stageInspector(layer.id, values: draft, patch: patch(for: draft), valid: valid(draft))
        if let key, focusedKey != key, valid(draft) { _ = model.applyInspector(layer.id) }
    }
    private func binding(_ key: String) -> Binding<String> {
        Binding(get: { draft[key] ?? originals[key] ?? "" }, set: { draft[key] = $0; stage(commitWhenUnfocused: key) })
    }
    private var colorBinding: Binding<Color> {
        Binding(get: {
            let value = UInt32((draft["color"] ?? "#ffffff").replacingOccurrences(of: "#", with: ""), radix: 16) ?? 0xffffff
            return Color(red: Double((value >> 16) & 255) / 255, green: Double((value >> 8) & 255) / 255, blue: Double(value & 255) / 255)
        }, set: { color in
            guard let rgb = NSColor(color).usingColorSpace(.sRGB) else { return }
            draft["color"] = String(format: "#%02x%02x%02x", Int((rgb.redComponent * 255).rounded()), Int((rgb.greenComponent * 255).rounded()), Int((rgb.blueComponent * 255).rounded()))
            stage(commitWhenUnfocused: "color")
        })
    }
    private func chooseImage() {
        let panel = NSOpenPanel(); panel.allowedContentTypes = [.png, .jpeg]
        model.presentFilePanel(panel) { url in
            guard let url else { return }
            importing = true; importError = nil
            importTask = Task {
                do {
                    let src = try await ImageImport.shared.read(url)
                    guard !Task.isCancelled else { return }
                    replacement = src; replacementName = url.lastPathComponent; stage()
                } catch { if !Task.isCancelled { importError = error.localizedDescription } }
                if !Task.isCancelled { importing = false }
            }
        }
    }
    private func chooseFont() {
        let panel = NSOpenPanel()
        panel.allowedContentTypes = [UTType(filenameExtension: "ttf") ?? .data, UTType(filenameExtension: "otf") ?? .data]
        panel.allowsMultipleSelection = false
        model.presentFilePanel(panel) { pendingFontURL = $0 }
    }

    var body: some View {
        ScrollView {
            VStack(alignment: .leading, spacing: 18) {
                HStack { Image(systemName: layer.symbol).foregroundStyle(layer.tint); Text(layer.kind.capitalized).font(.headline); Spacer() }
                TextField("Layer name", text: binding("name")).textFieldStyle(.roundedBorder).focused($focusedKey, equals: "name")
                HStack {
                    Toggle("Visible", isOn: Binding(get: { layer.visible }, set: { model.editProperties(["visible": $0]) }))
                    Toggle("Locked", isOn: Binding(get: { layer.locked }, set: { model.editProperties(["locked": $0]) }))
                }.toggleStyle(.checkbox)
                Divider()
                if layer.kind == "text" {
                    TextField("Text", text: binding("content"), axis: .vertical).lineLimit(3...6).textFieldStyle(.roundedBorder).focused($focusedKey, equals: "content")
                    Picker("Font", selection: binding("font")) {
                        Text("Courier New").tag("MONO")
                        ForEach(model.editor.fonts, id: \.id) { font in Text(font.name).tag(font.id) }
                    }
                    Button("Import font…", action: chooseFont).disabled(model.isImporting)
                    Picker("Alignment", selection: binding("align")) {
                        Text("Left").tag("left");Text("Center").tag("center");Text("Right").tag("right")
                    }
                }
                if layer.kind == "text" || layer.kind == "fill" {
                    HStack {
                        ColorPicker("Color", selection: colorBinding, supportsOpacity: false)
                        TextField("Hex color", text: binding("color")).textFieldStyle(.roundedBorder).frame(width: 100).focused($focusedKey, equals: "color")
                    }
                }
                if layer.kind == "image" {
                    Button("Replace image…", action: chooseImage).disabled(importing)
                    if importing { ProgressView("Reading image…") }
                    if replacement != nil {
                        Text(replacementName).font(.caption).lineLimit(2)
                        Button("Cancel replacement") { replacement = nil; stage() }
                    }
                    Picker("Fit", selection: binding("fit")) {
                        Text("Contain").tag("contain"); Text("Cover").tag("cover")
                        Text("Free").tag("free"); Text("Tile").tag("tile")
                    }
                }
                if layer.kind == "emoji" { TextField("Emojis separated by spaces", text: binding("emojis"), axis: .vertical).lineLimit(2...4).textFieldStyle(.roundedBorder).focused($focusedKey, equals: "emojis") }
                ForEach(numberFields, id: \.key) { field in
                    HStack {
                        Text(field.label).foregroundStyle(.secondary)
                        Spacer(minLength: 8)
                        TextField(field.label, text: binding(field.key)).multilineTextAlignment(.trailing)
                            .textFieldStyle(.roundedBorder).frame(width: 88)
                            .focused($focusedKey, equals: field.key)
                            .accessibilityIdentifier("property-" + field.key)
                    }
                }
                if model.inspectorDrafts[layer.id] != nil { Text(valid(draft) ? "Editing live" : "Check this value").font(.caption).foregroundStyle(.secondary) }
                HStack {
                    Button("Finish edit") {
                        if model.applyInspector(layer.id) { replacement = nil; draft = originals }
                    }.disabled(!valid(draft) || model.inspectorDrafts[layer.id] == nil || importing)
                        .keyboardShortcut(.return, modifiers: .command)
                    Button("Cancel edit") { model.discardInspector(layer.id); replacement = nil; draft = originals }
                        .disabled(model.inspectorDrafts[layer.id] == nil)
                }
                if let importError { Text(importError).foregroundStyle(.red).font(.caption) }
            }.padding(18)
        }
        .onAppear {
            draft = model.inspectorDrafts[layer.id]?.values ?? originals
            replacement = model.inspectorDrafts[layer.id]?.patch["src"] as? String
            if model.renameRequestID == layer.id {
                Task { @MainActor in focusedKey = "name"; model.renameRequestID = nil }
            }
        }
        .onChange(of: model.renameRequestID) { _, request in
            if request == layer.id {
                focusedKey = "name"
                model.renameRequestID = nil
            }
        }
        .onChange(of: model.documentRevision) { _, _ in
            if model.inspectorDrafts[layer.id] == nil { draft = originals; replacement = nil }
        }
        .onChange(of: model.inspectorDrafts[layer.id] == nil) { _, empty in
            if empty { draft = originals; replacement = nil }
        }
        .onChange(of: focusedKey) { old, new in
            model.isTextEditing = new != nil
            if old != nil && old != new && valid(draft) { _ = model.applyInspector(layer.id) }
        }
        .onDisappear {
            model.isTextEditing = false
            importTask?.cancel()
            if valid(draft) { _ = model.applyInspector(layer.id) }
        }
        .confirmationDialog("Embed this font in the project?", isPresented: Binding(
            get: { pendingFontURL != nil }, set: { if !$0 { pendingFontURL = nil } }
        )) {
            Button("Embed font") {
                if let url = pendingFontURL { model.importFont(to: layer.id, from: url) }
                pendingFontURL = nil
            }
            Button("Cancel", role: .cancel) { pendingFontURL = nil }
        } message: {
            Text("Confirm that you have permission to include this font file when sharing the project.")
        }
    }
}
private struct PropertyField {
    let key: String; let label: String; let range: ClosedRange<Double>; let factor: Double; let fallback: Double
    init(_ key: String, _ label: String, _ range: ClosedRange<Double>, factor: Double = 1, fallback: Double = 0) {
        self.key = key; self.label = label; self.range = range; self.factor = factor; self.fallback = fallback
    }
}
extension EditorLayer {
    var symbol: String {
        switch kind {case "text":return "textformat";case "image":return "photo";case "fill":return "square.fill";case "emoji":return "face.smiling";case "effect":return "slider.horizontal.3";default:return "square.stack"}
    }
    var tint: Color {
        switch kind {case "text":return .yellow;case "image":return .cyan;case "fill":return .orange;case "emoji":return .pink;case "effect":return .purple;default:return .secondary}
    }
}
