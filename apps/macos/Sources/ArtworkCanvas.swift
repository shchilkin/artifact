import SwiftUI

struct ArtworkTransform {
    var x: Double; var y: Double; var scaleX: Double; var scaleY: Double; var rotation: Double
    init(_ layer: EditorLayer) {
        x = layer.number("x", 0.5); y = layer.number("y", 0.5)
        scaleX = layer.number("scaleX", 1); scaleY = layer.number("scaleY", 1); rotation = layer.number("rotation")
    }
    var patch: [String: Double] { ["x":x,"y":y,"scaleX":scaleX,"scaleY":scaleY,"rotation":rotation] }
    func moved(_ size: CGSize, canvas: CGSize) -> Self {
        var result = self
        result.x = min(3,max(-2,x + size.width / canvas.width)); result.y = min(3,max(-2,y + size.height / canvas.height))
        return result
    }
    func scaled(_ factor: Double) -> Self {
        var result = self; result.scaleX = min(10,max(0.01,scaleX * factor)); result.scaleY = min(10,max(0.01,scaleY * factor)); return result
    }
}
struct ArtworkCanvas: View {
    @ObservedObject var model: ProjectModel
    @State private var zoom = 1.0
    @State private var initial: ArtworkTransform?
    @State private var draft: ArtworkTransform?

    private func bounds(_ layer: EditorLayer, _ transform: ArtworkTransform, _ canvas: CGSize) -> CGSize {
        let ratio = canvas.width / canvas.height
        if layer.kind == "text" {
            let lines = layer.string("content").components(separatedBy: "\n")
            let length = Double(lines.map(\.count).max() ?? 1)
            return CGSize(width: min(0.92,max(0.05,length * layer.number("size",74) * 0.6 / 540)) * transform.scaleX,
                          height: max(0.06,Double(lines.count) * layer.number("size",74) * 1.25 / 540 * ratio) * transform.scaleY)
        }
        let width = layer.number("sourceWidth",540), height = layer.number("sourceHeight",540)
        let fit = layer.string("fit", "free")
        let scale = fit == "cover" ? max(1/width,1/(height * ratio)) : fit == "contain" ? min(1/width,1/(height * ratio)) : 1/540.0
        return CGSize(width: width * scale * transform.scaleX, height: height * scale * ratio * transform.scaleY)
    }
    private func select(at point: CGPoint, canvas: CGSize) {
        let found = model.editor.orderedLayers.reversed().first { layer in
            guard layer.visible && layer.movable && !layer.locked else { return false }
            let t = ArtworkTransform(layer), size = bounds(layer,t,canvas), angle = -t.rotation * .pi / 180
            let dx = point.x - t.x * canvas.width, dy = point.y - t.y * canvas.height
            return abs(dx*cos(angle)-dy*sin(angle)) <= size.width*canvas.width/2
                && abs(dx*sin(angle)+dy*cos(angle)) <= size.height*canvas.height/2
        }
        if let found { model.selectedID = found.id }
    }
    private func update(_ transform: ArtworkTransform) { draft = transform; model.previewTransform(transform.patch) }
    private func finish() {
        if let draft { model.editProperties(draft.patch) }
        initial = nil; draft = nil
    }
    var body: some View {
        VStack(spacing: 0) {
            HStack {
                Text("Canvas").font(.headline)
                Spacer()
                Button { zoom = max(0.25,zoom-0.25) } label: { Image(systemName:"minus.magnifyingglass") }.help("Zoom out")
                Text(zoom == 1 ? "Fit" : "\(zoom, specifier: "%.2g")× fit").monospacedDigit().frame(width:64)
                Button { zoom = min(3,zoom+0.25) } label: { Image(systemName:"plus.magnifyingglass") }.help("Zoom in")
                Button("Fit") { zoom = 1 }
            }.buttonStyle(.borderless).padding(.horizontal,20).padding(.vertical,12)
            Divider()
            GeometryReader { geometry in
                let dimensions = model.previewDimensions
                let scale = max(0.1,min((geometry.size.width-72)/CGFloat(dimensions.width),
                                         (geometry.size.height-72)/CGFloat(dimensions.height))) * zoom
                let canvas = CGSize(width: CGFloat(dimensions.width) * scale, height: CGFloat(dimensions.height) * scale)
                ScrollView([.horizontal,.vertical]) {
                    ZStack {
                        Canvas { context,size in
                            for y in stride(from:0.0,to:size.height,by:16) {
                                for x in stride(from:0.0,to:size.width,by:16) {
                                    context.fill(Path(CGRect(x:x,y:y,width:16,height:16)),with:.color((Int(x/16)+Int(y/16))%2 == 0 ? Color(nsColor:.controlBackgroundColor) : Color(nsColor:.windowBackgroundColor)))
                                }
                            }
                        }
                        if let image=model.preview { Image(nsImage:image).resizable().interpolation(.high).frame(width:canvas.width,height:canvas.height).allowsHitTesting(false) }
                        if let layer=model.selectedLayer, layer.movable, layer.visible, !layer.locked {
                            let t=draft ?? ArtworkTransform(layer), box=bounds(layer,t,canvas)
                            let w=max(24,box.width*canvas.width), h=max(24,box.height*canvas.height)
                            ZStack {
                                Rectangle().stroke(Color.accentColor,lineWidth:1)
                                    .contentShape(Rectangle()).gesture(DragGesture(minimumDistance:3).onChanged { value in
                                        if initial == nil { initial=ArtworkTransform(layer) }
                                        update(initial!.moved(value.translation,canvas:canvas))
                                    }.onEnded { _ in finish() })
                                Circle().fill(Color.accentColor).frame(width:7,height:7).allowsHitTesting(false)
                                Image(systemName:"arrow.up.left.and.arrow.down.right")
                                    .font(.system(size:12,weight:.semibold)).padding(7).background(.regularMaterial,in:RoundedRectangle(cornerRadius:4))
                                    .position(x:w,y:h).accessibilityLabel("Scale selected layer")
                                    .gesture(DragGesture().onChanged { value in
                                        if initial == nil { initial=ArtworkTransform(layer) }
                                        update(initial!.scaled(max(0.02,1+(value.translation.width+value.translation.height)/max(40,w+h))))
                                    }.onEnded { _ in finish() })
                                Image(systemName:"arrow.clockwise")
                                    .font(.system(size:12,weight:.semibold)).padding(7).background(.regularMaterial,in:RoundedRectangle(cornerRadius:4))
                                    .position(x:w/2,y:-22).accessibilityLabel("Rotate selected layer")
                                    .gesture(DragGesture().onChanged { value in
                                        if initial == nil { initial=ArtworkTransform(layer) }
                                        var next=initial!; next.rotation=min(360,max(-360,next.rotation+value.translation.width/2));update(next)
                                    }.onEnded { _ in finish() })
                            }.frame(width:w,height:h).rotationEffect(.degrees(t.rotation)).position(x:t.x*canvas.width,y:t.y*canvas.height)
                        }
                    }.frame(width:canvas.width,height:canvas.height).contentShape(Rectangle())
                        .simultaneousGesture(SpatialTapGesture().onEnded { select(at:$0.location,canvas:canvas) })
                        .padding(36).frame(minWidth:geometry.size.width,minHeight:geometry.size.height)
                }
            }.background(Color(nsColor:.underPageBackgroundColor))
            Divider()
            HStack {
                if model.isRendering { ProgressView().controlSize(.small); Text("Rendering…") }
                else { Text("Preview \(model.previewDimensions.width) × \(model.previewDimensions.height)") }
                Spacer()
                Text(model.selectedLayer?.movable == true ? "Drag to move · handles to scale and rotate" : "Select a layer to edit")
            }.font(.caption).foregroundStyle(.secondary).padding(.horizontal,20).padding(.vertical,9)
        }
        .onChange(of:model.selectedID) { _,_ in
            if draft != nil { model.cancelTransformPreview() }
            initial=nil;draft=nil
        }
        .onDisappear { if draft != nil { model.cancelTransformPreview() }; initial=nil;draft=nil }
    }
}
