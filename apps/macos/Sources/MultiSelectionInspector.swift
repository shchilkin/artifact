import SwiftUI

struct MultiSelectionInspector: View {
    @ObservedObject var model: ProjectModel

    private var selected: [EditorLayer] {
        model.editor.orderedLayers.filter { model.selectedIDs.contains($0.id) }
    }

    var body: some View {
        VStack(alignment: .leading, spacing: 16) {
            Text("\(selected.count) layers selected").font(.headline)
            Text(selected.map(\.name).joined(separator: ", ")).font(.callout).foregroundStyle(.secondary)
                .lineLimit(3)
            Divider()
            HStack {
                Button("Show") { model.setSelectionProperties(["visible": true]) }
                Button("Hide") { model.setSelectionProperties(["visible": false]) }
            }
            HStack {
                Button("Lock") { model.setSelectionProperties(["locked": true]) }
                Button("Unlock") { model.setSelectionProperties(["locked": false]) }
            }
            Divider()
            Button("Duplicate layers", action: model.duplicateSelection)
            Button("Delete layers", role: .destructive, action: model.deleteSelection)
                .disabled(selected.contains { $0.locked })
            if model.hasGraph {
                Button("Create area", action: model.createArea)
                ForEach(model.editor.areas) { area in
                    Button("Move to \(area.name)") { model.assignSelection(to: area.id) }
                }
            }
            Spacer()
        }
        .buttonStyle(.bordered)
        .frame(maxWidth: .infinity, alignment: .leading)
        .padding(18)
    }
}
