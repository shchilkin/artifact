import AppKit
import SwiftUI

private enum CanvasHandle { case move, scale, rotate }

struct ArtworkCanvas: View {
    @ObservedObject var model: ProjectModel
    @State private var zoom = 1.0
    @State private var pinchStart: Double?
    @State private var initial: [String: ArtworkTransform] = [:]
    @State private var initialBounds: [String: CGRect] = [:]
    @State private var draft: [String: ArtworkTransform] = [:]
    @State private var keyboardMode: CanvasHandle = .move
    @State private var suppressGestureUntilEnd = false
    @State private var fitRequest = 0
    @FocusState private var canvasFocused: Bool

    private func transformedLayer(_ layer: EditorLayer) -> [String: Any] {
        var raw = layer.raw
        for (key, value) in (draft[layer.id] ?? ArtworkTransform(layer)).patch { raw[key] = value }
        return raw
    }

    private func geometry(_ layer: EditorLayer, canvas: CGSize) -> (center: CGPoint, size: CGSize)? {
        let local = model.localBounds(for: layer)
        guard !local.isNull, !local.isEmpty else { return nil }
        let t = draft[layer.id] ?? ArtworkTransform(layer)
        let dimension = model.previewDimensions
        let scale = Double(canvas.width) / Double(dimension.width)
        let angle = t.rotation * .pi / 180
        let offsetX = Double(local.midX) * t.scaleX
        let offsetY = Double(local.midY) * t.scaleY
        let center = CGPoint(x: (t.x * Double(dimension.width) + offsetX * cos(angle) - offsetY * sin(angle)) * scale,
                             y: (t.y * Double(dimension.height) + offsetX * sin(angle) + offsetY * cos(angle)) * scale)
        let size = CGSize(width: max(12, local.width * t.scaleX * scale),
                          height: max(12, local.height * t.scaleY * scale))
        return (center, size)
    }

    private func hit(_ point: CGPoint, canvas: CGSize) -> String? {
        guard model.canDirectEdit else { return nil }
        let dimensions = model.previewDimensions
        let rasterPoint = CGPoint(x: point.x * CGFloat(dimensions.width) / canvas.width,
                                  y: point.y * CGFloat(dimensions.height) / canvas.height)
        for layer in model.editor.orderedLayers.reversed() where layer.visible && layer.movable {
            if LayerGeometry.contains(rasterPoint, local: model.localBounds(for: layer), layer: transformedLayer(layer),
                                      width: Int(dimensions.width), height: Int(dimensions.height)) { return layer.id }
        }
        return nil
    }

    private func handle(_ offset: CGSize, center: CGPoint, rotation: Double) -> CGPoint {
        let angle = rotation * .pi / 180
        return CGPoint(x: center.x + offset.width * cos(angle) - offset.height * sin(angle),
                       y: center.y + offset.width * sin(angle) + offset.height * cos(angle))
    }

    private func beginGesture() {
        canvasFocused = true
        if initial.isEmpty {
            let selected = model.editor.orderedLayers.filter { model.selectedIDs.contains($0.id) && $0.movable }
            initial = Dictionary(uniqueKeysWithValues: selected.map { ($0.id, ArtworkTransform($0)) })
            initialBounds = Dictionary(uniqueKeysWithValues: selected.map { ($0.id, model.localBounds(for: $0)) })
        }
    }
    private func scaleGesture(_ translation: CGSize, canvas: CGSize, independent: Bool) {
        guard let id = model.selectedID, let source = initial[id], let bounds = initialBounds[id] else { return }
        let dimensions = model.previewDimensions
        let artwork = CGSize(width: CGFloat(dimensions.width), height: CGFloat(dimensions.height))
        guard let factors = source.scaleFactorsForHandle(translation, bounds: bounds, canvas: canvas,
                                                         artwork: artwork, independent: independent) else { return }
        updateGesture(Dictionary(uniqueKeysWithValues: initial.compactMap { id, transform in
            guard let bounds = initialBounds[id], !bounds.isNull, !bounds.isEmpty else { return nil }
            return (id, transform.scaledAroundOppositeCorner(factors, bounds: bounds, canvas: canvas,
                                                              artwork: artwork, independent: independent))
        }))
    }
    private func rotateGesture(_ translation: CGSize, canvas: CGSize, snap: Bool) {
        guard let id = model.selectedID, let source = initial[id], let bounds = initialBounds[id] else { return }
        let dimensions = model.previewDimensions
        let artwork = CGSize(width: CGFloat(dimensions.width), height: CGFloat(dimensions.height))
        guard let delta = source.rotationDeltaForHandle(translation, bounds: bounds, canvas: canvas,
                                                         artwork: artwork) else { return }
        updateGesture(Dictionary(uniqueKeysWithValues: initial.compactMap { id, transform in
            guard let bounds = initialBounds[id], !bounds.isNull, !bounds.isEmpty else { return nil }
            return (id, transform.rotatedAroundBoundsCenter(delta, bounds: bounds, canvas: canvas,
                                                             artwork: artwork, snap: snap))
        }))
    }
    private func updateGesture(_ next: [String: ArtworkTransform]) {
        draft = next
        model.previewTransforms(next.mapValues(\.patch))
    }
    private func finishGesture() {
        if suppressGestureUntilEnd { suppressGestureUntilEnd = false; return }
        if !draft.isEmpty { model.commitTransforms(draft.mapValues(\.patch)) }
        initial = [:]; initialBounds = [:]; draft = [:]
    }
    private func cancelGesture() {
        if !draft.isEmpty { model.cancelTransformPreview() }
        initial = [:]; initialBounds = [:]; draft = [:]
    }

    private func arrow(_ key: KeyEquivalent, modifiers: EventModifiers) -> KeyPress.Result {
        guard canvasFocused, model.canDirectEdit, let id = model.selectedID,
              let layer = model.editor.layers.first(where: { $0.id == id }), layer.movable else { return .ignored }
        let step: Double = modifiers.contains(.shift) ? 10 : 1
        let dx = key == .leftArrow ? -step : (key == .rightArrow ? step : 0)
        let dy = key == .upArrow ? -step : (key == .downArrow ? step : 0)
        let selected = model.editor.layers.filter { model.selectedIDs.contains($0.id) && $0.movable }
        let patches: [String: [String: Double]] = Dictionary(uniqueKeysWithValues: selected.map { item in
            var next = ArtworkTransform(item)
            switch keyboardMode {
            case .move: next = next.nudged(dx: dx, dy: dy, artwork: model.exportDimensions)
            case .rotate: next = next.rotated((dx != 0 ? dx : -dy))
            case .scale:
                let artwork = model.exportDimensions
                next = next.scaled(CGSize(width: dx, height: dy),
                                   canvas: CGSize(width: CGFloat(artwork.width), height: CGFloat(artwork.height)),
                                   independent: modifiers.contains(.option))
            }
            return (item.id, next.patch)
        })
        model.commitTransforms(patches)
        return .handled
    }

    var body: some View {
        VStack(spacing: 0) {
            HStack {
                Text("Canvas").font(.headline)
                Spacer()
                Button { zoom = max(0.25, zoom / 1.25) } label: { Image(systemName: "minus.magnifyingglass") }.help("Zoom out")
                Text("\(Int(zoom * 100))%").monospacedDigit().frame(width: 48)
                Button { zoom = min(8, zoom * 1.25) } label: { Image(systemName: "plus.magnifyingglass") }.help("Zoom in")
                Button("Fit") { zoom = 1; fitRequest += 1 }.help("Fit artwork to window")
            }.buttonStyle(.borderless).padding(.horizontal, 20).padding(.vertical, 12)
            Divider()
            GeometryReader { viewport in
                let dimensions = model.previewDimensions
                let fitScale = min((viewport.size.width - 72) / CGFloat(dimensions.width),
                                   (viewport.size.height - 72) / CGFloat(dimensions.height))
                let scale = max(0.1, fitScale) * CGFloat(zoom)
                let canvas = CGSize(width: CGFloat(dimensions.width) * scale, height: CGFloat(dimensions.height) * scale)
                ScrollViewReader { scroll in
                ScrollView([.horizontal, .vertical]) {
                    ZStack {
                        Canvas { context, size in
                            for y in stride(from: 0.0, to: size.height, by: 16) {
                                for x in stride(from: 0.0, to: size.width, by: 16) {
                                    context.fill(Path(CGRect(x: x, y: y, width: 16, height: 16)),
                                        with: .color((Int(x/16) + Int(y/16)) % 2 == 0
                                            ? Color(nsColor: .controlBackgroundColor) : Color(nsColor: .windowBackgroundColor)))
                                }
                            }
                        }
                        if let image = model.preview {
                            Image(nsImage: image).resizable().interpolation(.high)
                                .frame(width: canvas.width, height: canvas.height).allowsHitTesting(false)
                        }
                        ForEach(model.editor.orderedLayers.filter { model.canDirectEdit && model.selectedIDs.contains($0.id) && $0.visible && $0.movable }) { layer in
                            if let box = geometry(layer, canvas: canvas) {
                                let t = draft[layer.id] ?? ArtworkTransform(layer)
                                Rectangle().stroke(Color.accentColor, lineWidth: 1)
                                    .frame(width: box.size.width, height: box.size.height)
                                    .rotationEffect(.degrees(t.rotation))
                                    .position(box.center)
                                    .contentShape(Rectangle())
                                    .gesture(DragGesture(minimumDistance: 3).onChanged { value in
                                        guard !suppressGestureUntilEnd else { return }
                                        beginGesture()
                                        updateGesture(initial.mapValues { $0.moved(value.translation, canvas: canvas) })
                                    }.onEnded { _ in finishGesture() })
                                    .accessibilityLabel("Move \(layer.name)")
                                if layer.id == model.selectedID {
                                    Image(systemName: "arrow.up.left.and.arrow.down.right")
                                        .font(.system(size: 12, weight: .semibold)).padding(7)
                                        .background(.regularMaterial, in: RoundedRectangle(cornerRadius: 4))
                                        .position(handle(CGSize(width: box.size.width/2, height: box.size.height/2),
                                                         center: box.center, rotation: t.rotation))
                                        .accessibilityLabel("Scale selected layer")
                                        .onTapGesture { keyboardMode = .scale; canvasFocused = true }
                                        .gesture(DragGesture().onChanged { value in
                                            guard !suppressGestureUntilEnd else { return }
                                            keyboardMode = .scale; beginGesture()
                                            scaleGesture(value.translation, canvas: canvas,
                                                         independent: NSEvent.modifierFlags.contains(.option))
                                        }.onEnded { _ in finishGesture() })
                                    Image(systemName: "arrow.clockwise")
                                        .font(.system(size: 12, weight: .semibold)).padding(7)
                                        .background(.regularMaterial, in: RoundedRectangle(cornerRadius: 4))
                                        .position(handle(CGSize(width: 0, height: -box.size.height/2 - 22),
                                                         center: box.center, rotation: t.rotation))
                                        .accessibilityLabel("Rotate selected layer")
                                        .onTapGesture { keyboardMode = .rotate; canvasFocused = true }
                                        .gesture(DragGesture().onChanged { value in
                                            guard !suppressGestureUntilEnd else { return }
                                            keyboardMode = .rotate; beginGesture()
                                            rotateGesture(value.translation, canvas: canvas,
                                                          snap: NSEvent.modifierFlags.contains(.shift))
                                        }.onEnded { _ in finishGesture() })
                                }
                            }
                        }
                    }
                    .frame(width: canvas.width, height: canvas.height)
                    .contentShape(Rectangle())
                    .simultaneousGesture(SpatialTapGesture().onEnded { value in
                        canvasFocused = true; keyboardMode = .move
                        if let id = hit(value.location, canvas: canvas) {
                            model.selectLayer(id, extending: NSEvent.modifierFlags.contains(.command),
                                              range: NSEvent.modifierFlags.contains(.shift))
                        }
                    })
                    .focusable().focused($canvasFocused)
                    .onKeyPress(keys: [.leftArrow, .rightArrow, .upArrow, .downArrow]) { event in
                        arrow(event.key, modifiers: event.modifiers)
                    }
                    .onKeyPress(keys: [.escape]) { _ in
                        guard !draft.isEmpty || !initial.isEmpty else { return .ignored }
                        cancelGesture()
                        suppressGestureUntilEnd = true
                        return .handled
                    }
                    .id("artwork-canvas")
                    .padding(36).frame(minWidth: viewport.size.width, minHeight: viewport.size.height)
                }
                .onChange(of: fitRequest) { _, _ in
                    scroll.scrollTo("artwork-canvas", anchor: .center)
                }
                .gesture(MagnifyGesture().onChanged { value in
                    if pinchStart == nil { pinchStart = zoom }
                    zoom = min(8, max(0.25, (pinchStart ?? zoom) * value.magnification))
                }.onEnded { _ in pinchStart = nil })
                }
            }.background(Color(nsColor: .underPageBackgroundColor))
            Divider()
            HStack {
                if model.isRendering { ProgressView().controlSize(.small); Text("Rendering…") }
                else { Text("Preview \(model.previewDimensions.width) × \(model.previewDimensions.height)") }
                Spacer()
                Text(model.canDirectEdit
                    ? "Drag to move · Option scales axes separately · arrows move 1 px, Shift 10 px"
                    : "This graph combines sources. Edit placement in Layers or Nodes.")
            }.font(.caption).foregroundStyle(.secondary).padding(.horizontal, 20).padding(.vertical, 9)
        }
        .onChange(of: model.selectedID) { _, _ in cancelGesture() }
        .onDisappear { cancelGesture() }
    }
}
