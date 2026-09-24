import Foundation

enum NativePilotEffectModule {
    static let module = NativeRenderModule(name: "pilot-seven", accepts: { _ in true }) { target, layer in
        let json = String(data: try JSONSerialization.data(withJSONObject: layer), encoding: .utf8)!
        try target.applyPixels { pixels in
            try renderEffect(pixels: pixels, width: UInt32(target.width), height: UInt32(target.height),
                             layerJson: json, seed: target.seed)
        }
    }
}
