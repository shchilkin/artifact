import AppKit
import SwiftUI
import UniformTypeIdentifiers

@MainActor
final class AppDelegate: NSObject, NSApplicationDelegate, NSWindowDelegate {
    weak var model: ProjectModel?
    private var closing = false
    var pendingURL: URL?
    func applicationShouldTerminate(_ sender: NSApplication) -> NSApplication.TerminateReply {
        guard !closing, let model, model.isModified else { return .terminateNow }
        model.confirmDiscard(purgeOnDiscard: true) { [weak self] in self?.closing = true; sender.terminate(nil) }
        return .terminateCancel
    }
    func windowShouldClose(_ sender: NSWindow) -> Bool {
        guard !closing, let model, model.isModified else { return true }
        model.confirmDiscard(purgeOnDiscard: true) { [weak self] in self?.closing = true; sender.close(); self?.closing = false }
        return false
    }
    func application(_ sender: NSApplication, openFiles filenames: [String]) {
        if let file=filenames.first {
            let url=URL(fileURLWithPath:file)
            if let model {model.openURL(url)} else {pendingURL=url}
        }
        sender.reply(toOpenOrPrint:.success)
    }
}
@main struct ArtifactCorePilot: App {
    @StateObject private var model = ProjectModel()
    @NSApplicationDelegateAdaptor(AppDelegate.self) private var delegate
    var body: some Scene {
        Window("Artifact", id:"main") {
            EditorWorkspace(model:model).frame(minWidth:1100,minHeight:720)
                .onAppear {
                    delegate.model=model
                    NSApplication.shared.windows.first?.delegate=delegate
                    if let url=delegate.pendingURL {delegate.pendingURL=nil;model.openURL(url)}
                }.onOpenURL {model.openURL($0)}
        }.commands {
            CommandGroup(replacing:.newItem) {
                Button("New Project",action:model.newDocument).keyboardShortcut("n")
                Button("Open Project…",action:model.open).keyboardShortcut("o")
                Menu("Open Recent") {ForEach(model.recentFiles,id:\.path){url in Button(url.lastPathComponent){model.openURL(url)}}}
                Divider()
                Button("Save"){model.save()}.keyboardShortcut("s").disabled(model.summary==nil)
                Button("Save Copy…"){model.saveCopy()}.keyboardShortcut("s",modifiers:[.command,.shift]).disabled(model.summary==nil)
                Button("Export PNG…",action:model.exportPNG).keyboardShortcut("e",modifiers:[.command,.shift]).disabled(model.summary==nil||model.isExporting)
                Button("Export JPEG…",action:model.exportJPEG).disabled(model.summary==nil||model.isExporting)
            }
            CommandGroup(replacing:.undoRedo) {
                Button("Undo") {
                    if model.isTextEditing { NSApp.sendAction(Selector(("undo:")), to: nil, from: nil) }
                    else { model.undo() }
                }.keyboardShortcut("z").disabled(!model.isTextEditing && model.summary?.canUndo != true)
                Button("Redo") {
                    if model.isTextEditing { NSApp.sendAction(Selector(("redo:")), to: nil, from: nil) }
                    else { model.redo() }
                }.keyboardShortcut("z",modifiers:[.command,.shift]).disabled(!model.isTextEditing && model.summary?.canRedo != true)
            }
            CommandMenu("Layer") {
                Button("Add Text"){model.addLayer("text")}.keyboardShortcut("t",modifiers:[.command,.shift]).disabled(model.summary==nil)
                Button("Import Image…",action:model.importLayer).keyboardShortcut("i",modifiers:[.command,.shift]).disabled(model.summary==nil)
                Button("Paste Image",action:model.pasteImage).disabled(model.summary==nil)
                Divider()
                Button("Duplicate",action:model.duplicateSelection).keyboardShortcut("d").disabled(model.selectedIDs.isEmpty || model.isTextEditing)
                Button("Delete Layers",action:model.deleteSelection).keyboardShortcut(.delete,modifiers:.command)
                    .disabled(model.isTextEditing || model.selectedIDs.isEmpty || model.editor.layers.contains { model.selectedIDs.contains($0.id) && $0.locked })
                Divider()
                Button("Move Up") { model.moveSelection(1) }.keyboardShortcut(.upArrow, modifiers: [.command, .option])
                    .disabled(model.isTextEditing || !model.editor.canReorder || model.selectedIDs.isEmpty)
                Button("Move Down") { model.moveSelection(-1) }.keyboardShortcut(.downArrow, modifiers: [.command, .option])
                    .disabled(model.isTextEditing || !model.editor.canReorder || model.selectedIDs.isEmpty)
                Button("Create Area", action: model.createArea).disabled(model.selectedIDs.isEmpty || model.isTextEditing)
            }
        }
    }
}
struct EditorWorkspace: View {
    @ObservedObject var model:ProjectModel
    @State private var mode="Canvas"
    var body: some View {
        VStack(spacing:0) {
            if model.summary != nil {
                HSplitView {
                    LayersPanel(model:model).frame(minWidth:210,idealWidth:240,maxWidth:260)
                    VStack(spacing:0) {
                        if mode=="Nodes" {NodeWorkspace(model:model)} else {ArtworkCanvas(model:model)}
                        if let error=model.renderMessage {notice(error)}
                    }.frame(minWidth:440,maxWidth:.infinity,maxHeight:.infinity)
                    VStack(spacing:0) {
                        HStack{Text("Properties").font(.headline);Spacer()}.padding(18)
                        Divider()
                        if model.selectedIDs.count > 1 {
                            MultiSelectionInspector(model:model)
                        } else if let layer=model.selectedLayer {
                            LayerInspector(model:model,layer:layer).id(layer.id)
                        } else {
                            Text("Select a layer or node to edit its properties.").foregroundStyle(.secondary).padding(24)
                            Spacer()
                        }
                    }.frame(minWidth:280,idealWidth:300,maxWidth:360)
                }
            } else {welcome.frame(maxWidth:.infinity,maxHeight:.infinity)}
            if let message=model.message {notice(message)}
            if let message=model.exportMessage {notice(message)}
            if model.isExporting {HStack{ProgressView().controlSize(.small);Text("Exporting…");Spacer()}.padding(10)}
        }
        .toolbar {
            ToolbarItemGroup(placement:.navigation) {
                Button(action:model.open){Label("Open",systemImage:"folder")}.help("Open project")
                Menu {ForEach(model.recentFiles,id:\.path){url in Button(url.lastPathComponent){model.openURL(url)}}} label:{Image(systemName:"clock")}.help("Open recent project")
            }
            ToolbarItem(placement:.principal) {
                Picker("Workspace",selection:$mode){Text("Canvas").tag("Canvas");Text("Nodes").tag("Nodes")}.pickerStyle(.segmented).frame(width:190).disabled(model.summary==nil)
            }
            ToolbarItemGroup(placement:.primaryAction) {
                Button(action:model.undo){Image(systemName:"arrow.uturn.backward")}.help("Undo").disabled(model.summary?.canUndo != true)
                Button(action:model.redo){Image(systemName:"arrow.uturn.forward")}.help("Redo").disabled(model.summary?.canRedo != true)
                Button("Save"){model.save()}.disabled(model.summary==nil)
                Menu("Export") {
                    ForEach(1...3,id:\.self) { scale in
                        Button("PNG · \(scale)×") { model.exportFile(format: .png, scale: scale) }
                        Button("JPEG · \(scale)×") { model.exportFile(format: .jpeg, scale: scale) }
                    }
                }.disabled(model.summary==nil||model.isExporting)
            }
        }
        .navigationTitle(model.summary==nil ? "Artifact" : model.fileName)
        .navigationSubtitle(model.isModified ? "Edited" : "")
        .onDrop(of: [UTType.fileURL.identifier, UTType.png.identifier, UTType.jpeg.identifier, UTType.tiff.identifier], isTargeted: nil) { providers in
            guard model.summary != nil, let provider = providers.first else { return false }
            if provider.hasItemConformingToTypeIdentifier(UTType.fileURL.identifier) {
                provider.loadItem(forTypeIdentifier: UTType.fileURL.identifier, options: nil) { item, _ in
                    let url = (item as? URL) ?? (item as? Data).flatMap { URL(dataRepresentation: $0, relativeTo: nil) }
                    if let url { Task { @MainActor in model.importImage(from: url) } }
                }
                return true
            }
            guard let type = [UTType.png, .jpeg, .tiff].first(where: {
                provider.hasItemConformingToTypeIdentifier($0.identifier)
            }) else { return false }
            provider.loadDataRepresentation(forTypeIdentifier: type.identifier) { data, _ in
                if let data { Task { @MainActor in model.importImage(data: data) } }
            }
            return true
        }
    }
    private var welcome:some View {
        VStack(alignment:.leading,spacing:20) {
            Image(systemName:"square.stack.3d.up").font(.system(size:36)).foregroundStyle(.secondary)
            Text("Create your next cover.").font(.system(size:28,weight:.semibold))
            HStack{Button("New project",action:model.newDocument).buttonStyle(.borderedProminent);Button("Open project…",action:model.open)}
            if model.recoveryAvailable {Button("Restore unsaved project",action:model.restoreRecovery)}
            if !model.recentFiles.isEmpty {
                Divider();Text("Recent projects").font(.headline)
                ForEach(model.recentFiles.prefix(5),id:\.path){url in Button(url.lastPathComponent){model.openURL(url)}.buttonStyle(.link)}
            }
        }.frame(width:420).padding(40)
    }
    private func notice(_ message:String)->some View {
        HStack(alignment:.top){Image(systemName:"exclamationmark.triangle");Text(message).textSelection(.enabled);Spacer()}
            .font(.callout).foregroundStyle(.red).padding(12).background(.thinMaterial)
    }
}
