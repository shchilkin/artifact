import AppKit
import SwiftUI

@MainActor
final class AppDelegate: NSObject, NSApplicationDelegate, NSWindowDelegate {
    weak var model: ProjectModel?

    func applicationShouldTerminate(_ sender: NSApplication) -> NSApplication.TerminateReply {
        model?.confirmDiscard() == false ? .terminateCancel : .terminateNow
    }

    func windowShouldClose(_ sender: NSWindow) -> Bool { model?.confirmDiscard() ?? true }
}

@main
struct ArtifactCorePilot: App {
    @StateObject private var model = ProjectModel()
    @NSApplicationDelegateAdaptor(AppDelegate.self) private var delegate

    var body: some Scene {
        Window("Artifact Core Pilot", id: "main") {
            PilotView(model: model)
                .frame(minWidth: 900, minHeight: 760)
                .onAppear {
                    delegate.model = model
                    NSApplication.shared.windows.first?.delegate = delegate
                }
        }
        .commands {
            CommandGroup(replacing: .newItem) {
                Button("Open Project…", action: model.open).keyboardShortcut("o")
                Button("Save Copy…", action: model.saveCopy).keyboardShortcut("s")
                    .disabled(model.summary == nil)
            }
            CommandGroup(replacing: .undoRedo) {
                Button("Undo", action: model.undo).keyboardShortcut("z")
                    .disabled(model.summary?.canUndo != true)
                Button("Redo", action: model.redo).keyboardShortcut("z", modifiers: [.command, .shift])
                    .disabled(model.summary?.canRedo != true)
            }
        }
    }
}

struct PilotView: View {
    @ObservedObject var model: ProjectModel
    @State private var draftAmount = 0.0

    var body: some View {
        NavigationSplitView {
            List(model.summary?.layers ?? [], selection: $model.selectedID) { layer in
                VStack(alignment: .leading, spacing: 3) {
                    Text(layer.name)
                    Text(layer.kind).font(.caption).foregroundStyle(.secondary)
                }.tag(layer.id)
            }
            .navigationTitle("Layers")
            .navigationSplitViewColumnWidth(min: 210, ideal: 250)
        } detail: {
            VStack(alignment: .leading, spacing: 20) {
                Text(model.fileName).font(.headline).textSelection(.enabled)
                if model.isModified { Text("Unsaved changes").foregroundStyle(.secondary) }
                if let layer = model.selected {
                    Text(layer.name).font(.title2)
                    if let amount = layer.scanlines {
                        Form {
                            LabeledContent("Scanlines", value: amount.formatted())
                            TextField("New amount (0–100)", value: $draftAmount, format: .number)
                                .accessibilityIdentifier("scanlines-amount")
                            Button("Apply") { model.editScanlines(draftAmount) }
                                .disabled(!draftAmount.isFinite || !(0...100).contains(draftAmount) || draftAmount == amount)
                        }.formStyle(.grouped)
                        .frame(maxWidth: 440, maxHeight: 160)
                    } else if let text = layer.text {
                        TextInspector(value: text, onApply: model.editText).id(layer.id)
                    } else {
                        Text("This layer is preserved. Editing is not available in this build.")
                            .foregroundStyle(.secondary)
                    }
                    if model.isRendering { ProgressView("Rendering artwork…") }
                    if let image = model.preview {
                        Image(nsImage: image).resizable().interpolation(.high).scaledToFit()
                            .frame(maxWidth: .infinity, maxHeight: .infinity)
                            .accessibilityLabel("Rendered artwork, 3000 by 3000 pixels")
                    }
                    if let error = model.renderMessage { Text(error).foregroundStyle(.red) }
                } else {
                    ContentUnavailableView("Open an Artifact project", systemImage: "doc", description: Text("Choose an .artifact file to inspect its layers."))
                }
                if let message = model.message {
                    Text(message).foregroundStyle(.red).textSelection(.enabled)
                        .accessibilityLabel("Error: \(message)")
                }
                Spacer()
            }
            .padding(28)
            .onChange(of: model.selectedID) { _, _ in draftAmount = model.selected?.scanlines ?? 0 }
            .onChange(of: model.selected?.scanlines) { _, value in draftAmount = value ?? 0 }
        }
        .toolbar {
            Button("Open…", action: model.open)
            Button("Undo", action: model.undo).disabled(model.summary?.canUndo != true)
            Button("Redo", action: model.redo).disabled(model.summary?.canRedo != true)
            Button("Save Copy…", action: model.saveCopy).disabled(model.summary == nil)
            Button("Export PNG…", action: model.exportPNG).disabled(model.preview == nil || model.isRendering)
        }
    }
}
