import SwiftUI

struct NodeWorkspace: View {
    @ObservedObject var model: ProjectModel
    @State private var zoom = 1.0
    @State private var offset = CGSize.zero
    @State private var panStart: CGSize?
    @State private var movedID: String?
    @State private var nodeDraft: CGPoint?
    @State private var connectionFrom: String?
    @State private var didFit = false
    private let nodeSize = CGSize(width:200,height:100)
    private var ids: [String] { model.editor.layers.map(\.id) + ["__export__"] }
    private func point(_ id:String) -> CGPoint { movedID == id ? nodeDraft ?? model.editor.position(id) : model.editor.position(id) }
    private func screen(_ p:CGPoint) -> CGPoint { CGPoint(x:p.x*zoom+offset.width,y:p.y*zoom+offset.height) }
    private func fit(_ size:CGSize) {
        let points=ids.map { model.editor.position($0) }
        let minX=points.map(\.x).min() ?? 0,minY=points.map(\.y).min() ?? 0
        let maxX=(points.map(\.x).max() ?? 0)+nodeSize.width,maxY=(points.map(\.y).max() ?? 0)+nodeSize.height
        let contentWidth = maxX - minX
        let contentHeight = maxY - minY
        let widthScale = (size.width - 100) / max(300, contentWidth)
        let heightScale = (size.height - 100) / max(200, contentHeight)
        zoom = Double(min(1.2, max(0.85, min(widthScale, heightScale))))
        let scale = CGFloat(zoom)
        if contentWidth * scale > size.width - 100 {
            let focus = model.editor.position(model.selectedID ?? ids.first ?? "__export__")
            let offsetX = (size.width - nodeSize.width * scale) / 2 - focus.x * scale
            let offsetY = (size.height - nodeSize.height * scale) / 2 - focus.y * scale
            offset = CGSize(width: offsetX, height: offsetY)
        } else {
            let offsetX = (size.width - contentWidth * scale) / 2 - minX * scale
            let offsetY = (size.height - contentHeight * scale) / 2 - minY * scale
            offset = CGSize(width: offsetX, height: offsetY)
        }
    }
    var body: some View {
        GeometryReader { geometry in
            ZStack(alignment:.topLeading) {
                Color(nsColor:.underPageBackgroundColor).contentShape(Rectangle())
                    .gesture(DragGesture().onChanged { value in
                        if panStart == nil { panStart=offset }
                        offset=CGSize(width:panStart!.width+value.translation.width,height:panStart!.height+value.translation.height)
                    }.onEnded { _ in panStart=nil })
                    .onTapGesture { connectionFrom=nil }
                Canvas { context,size in
                    let step=32*zoom
                    if step>=8 {
                        for y in stride(from:offset.height.truncatingRemainder(dividingBy:step),to:size.height,by:step) {
                            for x in stride(from:offset.width.truncatingRemainder(dividingBy:step),to:size.width,by:step) {context.fill(Path(ellipseIn:CGRect(x:x,y:y,width:1.5,height:1.5)),with:.color(.secondary.opacity(0.35)))}
                        }
                    }
                    for edge in model.editor.edges {
                        let a=screen(point(edge.from)), b=screen(point(edge.to))
                        let start=CGPoint(x:a.x+nodeSize.width*zoom,y:a.y+nodeSize.height/2*zoom)
                        let end=CGPoint(x:b.x,y:b.y+nodeSize.height/2*zoom)
                        var path=Path();path.move(to:start)
                        path.addCurve(to:end,control1:CGPoint(x:start.x+80*zoom,y:start.y),control2:CGPoint(x:end.x-80*zoom,y:end.y))
                        context.stroke(path,with:.color(model.editor.order.contains(edge.from) ? .accentColor : .secondary),lineWidth:2)
                    }
                }.allowsHitTesting(false)
                ForEach(ids,id:\.self) { id in
                    node(id).scaleEffect(zoom,anchor:.topLeading)
                        .offset(x:screen(point(id)).x,y:screen(point(id)).y)
                }
                HStack {
                    Text("Nodes").font(.headline)
                    if let connectionFrom { Text("Connect from \(model.editor.layers.first{$0.id==connectionFrom}?.name ?? "node") → input").font(.caption);Button("Cancel"){self.connectionFrom=nil} }
                    Spacer()
                    Button { zoom=max(0.08,zoom/1.25) } label:{Image(systemName:"minus.magnifyingglass")}.help("Zoom out")
                    Text("\(Int(zoom*100))%").font(.caption).monospacedDigit().frame(width: 40)
                    Button { zoom=min(2,zoom*1.25) } label:{Image(systemName:"plus.magnifyingglass")}.help("Zoom in")
                    Button("Frame"){fit(geometry.size)}.help("Frame selection at a readable scale; drag the background to pan")
                }.padding(12).background(.regularMaterial)
            }.clipped().onAppear {if !didFit {fit(geometry.size);didFit=true}}
        }
    }
    private func node(_ id:String)->some View {
        let layer=model.editor.layers.first{$0.id==id}, selected=model.selectedID==id
        return HStack(spacing:6) {
            Button {
                if let from=connectionFrom {model.command(["type":"connect","from":from,"to":id]);connectionFrom=nil}
            } label: {Circle().fill(connectionFrom == nil ? Color.secondary : Color.accentColor).frame(width:14,height:14).padding(4)}
                .buttonStyle(.plain).help("Connect input").accessibilityLabel("Connect input to \(layer?.name ?? "Output")")
            VStack(alignment:.leading,spacing:8) {
                Label(layer?.name ?? "Output",systemImage:layer?.symbol ?? "square.and.arrow.up").font(.system(size:14,weight:.semibold)).lineLimit(2)
                Text(layer?.kind.capitalized ?? "PNG · 3000 × 3000").font(.system(size:12)).foregroundStyle(.secondary)
            }.frame(maxWidth:.infinity,alignment:.leading).contentShape(Rectangle())
                .onTapGesture {if layer != nil {model.selectedID=id}}
                .gesture(DragGesture().onChanged { value in
                    movedID=id;let p=model.editor.position(id)
                    nodeDraft=CGPoint(x:p.x+value.translation.width/zoom,y:p.y+value.translation.height/zoom)
                }.onEnded { _ in
                    if let nodeDraft {model.command(["type":"move_node","id":id,"x":nodeDraft.x,"y":nodeDraft.y])}
                    movedID=nil;nodeDraft=nil
                })
            if layer != nil {
                Button {connectionFrom=id} label:{Circle().fill(connectionFrom==id ? Color.accentColor : layer?.tint ?? .secondary).frame(width:14,height:14).padding(4)}
                    .buttonStyle(.plain).help("Connect output").accessibilityLabel("Connect from \(layer!.name)")
            }
        }.padding(.vertical,12).frame(width:nodeSize.width,height:nodeSize.height)
            .background(Color(nsColor:.controlBackgroundColor),in:RoundedRectangle(cornerRadius:8))
            .overlay(RoundedRectangle(cornerRadius:8).stroke(selected ? Color.accentColor : (layer?.tint ?? .secondary).opacity(0.7),lineWidth:selected ? 2 : 1))
            .contextMenu {
                Button("Disconnect input"){model.command(["type":"disconnect","to":id])}
                if let layer {
                    Button("Duplicate"){model.selectedID=layer.id;model.duplicate()}
                    Button("Delete",role:.destructive){model.selectedID=layer.id;model.deleteSelected()}.disabled(layer.locked)
                }
            }
    }
}
