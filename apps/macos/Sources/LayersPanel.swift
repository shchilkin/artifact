import AppKit
import SwiftUI
import UniformTypeIdentifiers

struct LayersPanel: View {
    @ObservedObject var model: ProjectModel

    private var groupedIDs: Set<String> { Set(model.editor.areas.flatMap(\.nodeIDs)) }
    private var ungrouped: [EditorLayer] {
        model.editor.orderedLayers.reversed().filter { !groupedIDs.contains($0.id) }
    }

    var body: some View {
        VStack(spacing: 0) {
            HStack {
                Text("Layers").font(.headline)
                Text("\(model.editor.layers.count)").foregroundStyle(.secondary).monospacedDigit()
                Spacer()
                Menu {
                    Button("Text") { model.addLayer("text") }
                    Button("Image…", action: model.importLayer)
                    Button("Fill") { model.addLayer("fill") }
                    Button("Emojis") { model.addLayer("emoji") }
                    Button("Effect") { model.addLayer("effect") }
                } label: { Image(systemName: "plus") }
                    .menuStyle(.borderlessButton).frame(width: 28).help("Add layer")
            }.padding(16)
            Divider()
            List(selection: $model.selectedIDs) {
                ForEach(model.editor.areas) { area in
                    HStack {
                        Button { model.setAreaCollapsed(area.id, !area.collapsed) } label: {
                            Image(systemName: area.collapsed ? "chevron.right" : "chevron.down")
                        }.buttonStyle(.borderless).accessibilityLabel(area.collapsed ? "Expand \(area.name)" : "Collapse \(area.name)")
                        Image(systemName: "square.stack.3d.up").foregroundStyle(.secondary)
                        Text(area.name).fontWeight(.medium)
                        Spacer()
                        Text("\(area.nodeIDs.count)").foregroundStyle(.secondary)
                    }.padding(.vertical, 5)
                    if !area.collapsed {
                        ForEach(model.editor.orderedLayers.reversed().filter { area.nodeIDs.contains($0.id) }) { layer in
                            row(layer).padding(.leading, 12).tag(layer.id)
                        }
                    }
                }
                ForEach(ungrouped) { layer in row(layer).tag(layer.id) }
            }
            .listStyle(.sidebar)
            .onChange(of: model.selectedIDs) { _, _ in model.syncPrimarySelection() }
            if !model.editor.canReorder {
                Text("Composition order follows node connections.").font(.caption)
                    .foregroundStyle(.secondary).padding(12)
            }
            Divider()
            HStack {
                Button { model.moveSelection(1) } label: { Image(systemName: "arrow.up") }
                    .help("Move selected layers up").disabled(!model.editor.canReorder || model.selectedIDs.isEmpty)
                Button { model.moveSelection(-1) } label: { Image(systemName: "arrow.down") }
                    .help("Move selected layers down").disabled(!model.editor.canReorder || model.selectedIDs.isEmpty)
                Spacer()
                Menu {
                    Button("Create area from selection", action: model.createArea)
                    ForEach(model.editor.areas) { area in
                        Button("Move to \(area.name)") { model.assignSelection(to: area.id) }
                    }
                    Button("Remove from areas", action: model.removeSelectionFromAreas)
                } label: { Image(systemName: "square.stack") }
                    .help("Organize selected layers").disabled(model.selectedIDs.isEmpty)
                Button(action: model.duplicateSelection) { Image(systemName: "plus.square.on.square") }
                    .help("Duplicate selected layers").disabled(model.selectedIDs.isEmpty)
                Button(action: model.deleteSelection) { Image(systemName: "trash") }
                    .help("Delete selected layers").disabled(model.selectedIDs.isEmpty || model.editor.layers.contains { model.selectedIDs.contains($0.id) && $0.locked })
            }.buttonStyle(.borderless).padding(14)
        }
    }

    private func row(_ layer: EditorLayer) -> some View {
        HStack(spacing: 10) {
            Image(systemName: layer.symbol).foregroundStyle(layer.tint).frame(width: 20)
            Text(layer.name).lineLimit(2).opacity(layer.visible ? 1 : 0.5)
            Spacer(minLength: 0)
            if layer.locked { Image(systemName: "lock.fill").font(.caption).foregroundStyle(.secondary) }
            Button {
                model.command(["type": "edit_layer", "id": layer.id, "patch": ["visible": !layer.visible]])
            } label: { Image(systemName: layer.visible ? "eye" : "eye.slash").foregroundStyle(.secondary) }
                .buttonStyle(.borderless).help(layer.visible ? "Hide \(layer.name)" : "Show \(layer.name)")
        }
        .padding(.vertical, 5)
        .onDrag { NSItemProvider(object: layer.id as NSString) }
        .onDrop(of: [UTType.plainText.identifier], isTargeted: nil) { providers in
            guard model.editor.canReorder, let provider = providers.first else { return false }
            _ = provider.loadObject(ofClass: NSString.self) { value, _ in
                guard let source = value as? String else { return }
                Task { @MainActor in
                    if !model.selectedIDs.contains(source) { model.selectLayer(source) }
                    model.reorderSelection(before: layer.id)
                }
            }
            return true
        }
        .contextMenu {
            Button("Rename") { model.requestRename(layer.id) }
            Button("Duplicate") { model.selectLayer(layer.id); model.duplicate() }
            Button(layer.locked ? "Unlock" : "Lock") {
                model.command(["type": "edit_layer", "id": layer.id, "patch": ["locked": !layer.locked]])
            }
            Divider()
            Button("Delete", role: .destructive) { model.selectLayer(layer.id); model.deleteSelected() }
                .disabled(layer.locked)
        }
    }
}
