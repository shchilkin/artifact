//! Bounded Viber renderer: shared graph plan, seeded layout, straight-alpha RGBA effects.
//! Raster text/image decoding remains in the platform adapter. No document mutation.
use crate::{CoreError, DocumentSession};
use serde_json::{Value, json};
use std::collections::BTreeMap;

pub fn number(v: &Value, key: &str, default: f64) -> f64 {
    v[key].as_f64().unwrap_or(default)
}
struct Rng(u32);
impl Rng {
    fn new(seed: u32) -> Self {
        Self(seed ^ 0x12345678)
    }
    fn next(&mut self) -> f64 {
        self.0 = self.0.wrapping_mul(1664525).wrapping_add(1013904223);
        self.0 as f64 / 4294967296.0
    }
}
const SUPPORTED: &[&str] = &[
    "glitch",
    "grain",
    "noiseWarp",
    "vortex",
    "tearAmt",
    "scanlines",
    "ca",
];
const UNSUPPORTED: &[&str] = &[
    "badStream",
    "rgbSplit",
    "retroResolution",
    "dotGrain",
    "tintOp",
    "sepia",
    "infrared",
    "dither",
    "indexedPalette",
    "gradientMap",
    "channelMixer",
    "edgeCrush",
    "silhouetteCrush",
    "pixelStretch",
    "bokehBlur",
    "hatching",
    "vhsTracking",
    "matte",
    "waveAmt",
    "zoomBlur",
    "neonGlow",
    "overprint",
    "solarize",
    "bleachBypass",
    "cyanotype",
    "splitToneAmt",
    "rippleAmt",
    "patternRefraction",
    "kaleidoscope",
    "emboss",
    "linocut",
    "fog",
    "gooeyMerge",
    "speedLines",
    "squeezeX",
    "squeezeY",
    "mirror",
    "dataMosh",
    "interlace",
    "morphAmt",
    "barrel",
    "pixelate",
    "posterize",
    "hueShift",
    "duotone",
    "halftone",
    "risoShift",
    "bloom",
    "blurAmt",
    "threshold",
    "edgeDetect",
    "gradMix",
    "vignette",
    "filmBurn",
    "rayInt",
];
fn validate_effect(layer: &Value) -> Result<(), CoreError> {
    if layer["maskAlpha"] == true || UNSUPPORTED.iter().any(|key| number(layer, key, 0.0) != 0.0) {
        return Err(CoreError("This effect is outside the Viber render pilot"));
    }
    for key in SUPPORTED {
        let n = number(layer, key, 0.0);
        if !n.is_finite() || !(0.0..=100.0).contains(&n) {
            return Err(CoreError("Invalid effect amount"));
        }
    }
    for key in ["tearSize", "scanlineWidth"] {
        let n = number(layer, key, 1.0);
        if !n.is_finite() || !(0.01..=100.0).contains(&n) {
            return Err(CoreError("Invalid effect size"));
        }
    }
    Ok(())
}
fn dimensions(width: u32, height: u32) -> Result<(usize, usize), CoreError> {
    if width == 0 || height == 0 || width > 3000 || height > 3000 {
        return Err(CoreError("Render dimensions must be 1–3000 pixels"));
    }
    Ok((width as usize, height as usize))
}
fn aspect_dimensions(aspect: &str, width: u32, height: u32) -> Result<(), CoreError> {
    let (base_width, base_height): (u32, u32) = match aspect {
        "1:1" => (1000, 1000),
        "4:5" => (1080, 1350),
        "9:16" => (1080, 1920),
        "16:9" => (1920, 1080),
        _ => return Err(CoreError("Unsupported document aspect")),
    };
    // Draft dimensions may round one axis by a pixel. The full export caller
    // passes the exact base dimensions; this only validates plan geometry.
    if (i64::from(width) * i64::from(base_height) - i64::from(height) * i64::from(base_width)).abs()
        > i64::from(base_width.max(base_height))
    {
        return Err(CoreError("Render dimensions do not match document aspect"));
    }
    Ok(())
}
impl DocumentSession {
    pub fn render_plan_json(&self, width: u32, height: u32) -> Result<String, CoreError> {
        self.render_target_plan_json(width, height, crate::graph::OUTPUT_ID)
    }

    /// Immutable platform render recipe. `graph::plan` is the only topology
    /// authority; the native rasterizer receives ordered nodes and explicit
    /// port inputs rather than inferring a chain from `layers`.
    pub fn render_target_plan_json(
        &self,
        width: u32,
        height: u32,
        target_id: &str,
    ) -> Result<String, CoreError> {
        dimensions(width, height)?;
        let doc = &self.package["document"];
        aspect_dimensions(
            doc["global"]["aspect"].as_str().unwrap_or("1:1"),
            width,
            height,
        )?;
        let layers = doc["layers"].as_array().unwrap();
        if layers.len() > 256 {
            return Err(CoreError("Render pilot supports up to 256 layers"));
        }
        let semantic = crate::graph::plan(doc, target_id)
            .map_err(|_| CoreError("Invalid graph target or topology"))?;
        if semantic["renderable2d"] != true {
            return Err(CoreError(
                "Graph target contains an unsupported 2D render capability",
            ));
        }
        let is_graph = semantic["mode"] == "graph";
        let mut order: Vec<Value> = if is_graph {
            semantic["renderLayerIds"]
                .as_array()
                .unwrap()
                .iter()
                .filter_map(|id| layers.iter().find(|layer| layer["id"] == *id).cloned())
                .collect()
        } else {
            layers.clone()
        };
        let seed = number(&doc["global"], "seed", 0.0) as u32;
        for layer in &mut order {
            if layer["visible"] == false {
                continue;
            }
            if !layer["blendMode"].is_null() {
                let mode = layer["blendMode"]
                    .as_str()
                    .ok_or(CoreError("Unsupported 2D blend mode"))?;
                if ![
                    "normal",
                    "multiply",
                    "screen",
                    "overlay",
                    "darken",
                    "lighten",
                    "color-dodge",
                    "color-burn",
                    "hard-light",
                    "soft-light",
                    "difference",
                    "exclusion",
                    "hue",
                    "saturation",
                    "color",
                    "luminosity",
                ]
                .contains(&mode)
                {
                    return Err(CoreError("Unsupported 2D blend mode"));
                }
            }
            match layer["kind"].as_str().unwrap_or("") {
                "fill" | "text" => {}
                "image" => {
                    if !["cover", "contain", "free", "tile"]
                        .contains(&layer["fit"].as_str().unwrap_or(""))
                    {
                        return Err(CoreError("Unsupported image fit"));
                    }
                }
                "effect" => {
                    validate_effect(layer)?;
                    // Web's color pass rounds CA against its 540px reference
                    // canvas. Apply it to the transient plan at every render
                    // size; export renders at the base aspect before upscaling.
                    if number(layer, "ca", 0.0) > 0.0 {
                        layer["ca"] =
                            json!((number(layer, "ca", 0.0) * width as f64 / 540.0).round());
                    }
                }
                "emoji" => {
                    let emojis = layer["emojis"]
                        .as_array()
                        .ok_or(CoreError("Invalid emoji source"))?;
                    let density = number(layer, "density", 0.0);
                    if !(0.0..=1000.0).contains(&density)
                        || emojis.is_empty()
                        || emojis.iter().any(|e| e.as_str().is_none())
                    {
                        return Err(CoreError("Invalid emoji source"));
                    }
                    let mut rng = Rng::new(
                        seed.wrapping_add(number(layer, "seedOffset", 0.0) as u32) ^ 0x7a8b9c,
                    );
                    let mut items = Vec::new();
                    for _ in 0..density as usize {
                        let x = rng.next() * width as f64;
                        let y = rng.next() * height as f64;
                        let size = (number(layer, "minSz", 44.0)
                            + rng.next()
                                * (number(layer, "maxSz", 106.0) - number(layer, "minSz", 44.0)))
                            * width as f64
                            / 540.0;
                        let rotation = (rng.next() - 0.5) * 1.2;
                        let opacity = 0.6 + rng.next() * 0.4;
                        let emoji = &emojis[(rng.next() * emojis.len() as f64) as usize];
                        items.push(json!({"x":x,"y":y,"size":size,"rotation":rotation,"opacity":opacity,"emoji":emoji}));
                    }
                    let dist = |v: &Value| {
                        (number(v, "x", 0.0) - width as f64 / 2.0)
                            .hypot(number(v, "y", 0.0) - height as f64 / 2.0)
                    };
                    items.sort_by(|a, b| dist(b).total_cmp(&dist(a)));
                    layer["renderItems"] = json!(items);
                }
                _ => return Err(CoreError("Unsupported layer kind for the render pilot")),
            }
        }
        let mut nodes = Vec::new();
        if is_graph {
            let mut keys: BTreeMap<String, String> = BTreeMap::new();
            let mut ids: Vec<String> = semantic["dependencyNodeIds"]
                .as_array()
                .unwrap()
                .iter()
                .filter_map(|id| id.as_str().map(str::to_owned))
                .collect();
            if target_id == crate::graph::OUTPUT_ID {
                ids.push(target_id.to_owned());
            }
            for id in ids {
                let (kind, config) = if id == crate::graph::OUTPUT_ID {
                    ("export", json!({"id":id}))
                } else if let Some(layer) = order.iter().find(|layer| layer["id"] == id) {
                    (layer["kind"].as_str().unwrap_or(""), layer.clone())
                } else {
                    let graph = &doc["graph"];
                    let families = [
                        ("merge", "mergeNodes"),
                        ("color", "colorNodes"),
                        ("repeat", "repeatNodes"),
                        ("mask", "maskNodes"),
                        ("transform", "transformNodes"),
                        ("grimeShadow", "grimeShadowNodes"),
                    ];
                    let (kind, collection, raw) = families
                        .iter()
                        .find_map(|(kind, collection)| {
                            graph[*collection]
                                .as_array()?
                                .iter()
                                .find(|node| node["id"] == id)
                                .map(|node| (*kind, *collection, node))
                        })
                        .ok_or(CoreError(
                            "Graph target contains an unsupported 2D render capability",
                        ))?;
                    let mut config = crate::graph::node_defaults(collection);
                    for (key, value) in raw.as_object().ok_or(CoreError("Invalid graph node"))? {
                        if crate::graph::valid_node_field(collection, key, value) == Some(false) {
                            return Err(CoreError("Invalid 2D graph node parameter"));
                        }
                        config[key] = value.clone();
                    }
                    (kind, config)
                };
                let mut inputs = Vec::new();
                for edge in semantic["dependencyEdges"].as_array().unwrap() {
                    if edge["toId"] != id {
                        continue;
                    }
                    let from = edge["fromId"]
                        .as_str()
                        .ok_or(CoreError("Invalid graph edge"))?;
                    let key = keys
                        .get(from)
                        .ok_or(CoreError("Graph dependencies are out of order"))?;
                    inputs.push(json!({"port":edge["toPort"],"sourceId":from,"sourceKey":key}));
                }
                // Canonical Value serialization uses sorted object keys. Include
                // resources, dimensions and all upstream signatures; omit UI
                // positions, names and the document revision.
                let mut pixel_config = config.clone();
                if let Some(object) = pixel_config.as_object_mut() {
                    object.remove("name");
                }
                let signature = json!({"kind":kind,"config":pixel_config,"inputs":inputs,
                    "width":width,"height":height,"seed":seed,"fontAssets":doc["fontAssets"]});
                let mut hash = 0xcbf29ce484222325_u64;
                for byte in signature.to_string().bytes() {
                    hash = (hash ^ u64::from(byte)).wrapping_mul(0x100000001b3);
                }
                let cache_key = format!("{id}:{hash:016x}");
                keys.insert(id.clone(), cache_key.clone());
                nodes.push(json!({"id":id,"kind":kind,"config":config,"inputs":inputs,"cacheKey":cache_key}));
            }
        }
        Ok(
            json!({"version":2,"mode":semantic["mode"],"targetId":target_id,
            "width":width,"height":height,"seed":seed,
            "background":if is_graph {json!("transparent")} else {doc["global"]["bg"].clone()},
            "layers":order,"nodes":nodes,"fontAssets":doc["fontAssets"]})
            .to_string(),
        )
    }
}
fn byte(v: f64) -> u8 {
    v.clamp(0.0, 255.0).round_ties_even() as u8
}
fn fract(v: f64) -> f64 {
    v - v.floor()
}
fn noise(x: f64, y: f64) -> f64 {
    // Use shader-width arithmetic for the chaotic hash; f64 changes its texture.
    fn fract32(v: f32) -> f32 {
        v - v.floor()
    }
    fn hash(x: f32, y: f32) -> f32 {
        let mut a = fract32(x * 234.34);
        let mut b = fract32(y * 435.345);
        let dot = a * (a + 34.23) + b * (b + 34.23);
        a += dot;
        b += dot;
        fract32(a * b)
    }
    let x = x as f32;
    let y = y as f32;
    let ix = x.floor();
    let iy = y.floor();
    let fx = fract32(x);
    let fy = fract32(y);
    let fx = fx * fx * (3.0 - 2.0 * fx);
    let fy = fy * fy * (3.0 - 2.0 * fy);
    let lerp = |a: f32, b: f32, t: f32| a + (b - a) * t;
    lerp(
        lerp(hash(ix, iy), hash(ix + 1.0, iy), fx),
        lerp(hash(ix, iy + 1.0), hash(ix + 1.0, iy + 1.0), fx),
        fy,
    ) as f64
}
// Straight alpha input/output, bilinear sampling in premultiplied alpha.
fn sample(src: &[u8], w: usize, h: usize, u: f64, v: f64) -> [u8; 4] {
    let x = u.clamp(0.0, 1.0) * (w - 1) as f64;
    let y = v.clamp(0.0, 1.0) * (h - 1) as f64;
    let ix = x.floor() as usize;
    let iy = y.floor() as usize;
    let fx = x.fract();
    let fy = y.fract();
    let mut result = [0.0; 4];
    for (sx, sy, t) in [
        (ix, iy, (1.0 - fx) * (1.0 - fy)),
        ((ix + 1).min(w - 1), iy, fx * (1.0 - fy)),
        (ix, (iy + 1).min(h - 1), (1.0 - fx) * fy),
        ((ix + 1).min(w - 1), (iy + 1).min(h - 1), fx * fy),
    ] {
        let i = (sy * w + sx) * 4;
        let alpha = src[i + 3] as f64 / 255.0;
        for c in 0..3 {
            result[c] += src[i + c] as f64 * alpha * t;
        }
        result[3] += alpha * t;
    }
    let a = result[3];
    if a <= 0.0 {
        return [0; 4];
    }
    [
        byte(result[0] / a),
        byte(result[1] / a),
        byte(result[2] / a),
        byte(a * 255.0),
    ]
}
fn blend(pixel: &mut [u8], color: [f64; 3], alpha: f64, mode: &str) {
    let ab = pixel[3] as f64 / 255.0;
    let ao = alpha + ab * (1.0 - alpha);
    for c in 0..3 {
        let b = pixel[c] as f64 / 255.0;
        let s = color[c];
        let f = match mode {
            "screen" => 1.0 - (1.0 - b) * (1.0 - s),
            "overlay" => {
                if b <= 0.5 {
                    2.0 * b * s
                } else {
                    1.0 - 2.0 * (1.0 - b) * (1.0 - s)
                }
            }
            _ => s,
        };
        pixel[c] = if ao > 0.0 {
            byte(((1.0 - alpha) * ab * b + alpha * ((1.0 - ab) * s + ab * f)) / ao * 255.0)
        } else {
            0
        };
    }
    pixel[3] = byte(ao * 255.0);
}
/// Same seven effect kernels in native and WASM. GPU shader ports are CPU
/// approximations until compared with the browser's mediump GLSL implementation.
pub fn effect_rgba(
    mut pixels: Vec<u8>,
    width: u32,
    height: u32,
    layer_json: &str,
    seed: u32,
) -> Result<Vec<u8>, CoreError> {
    let (w, h) = dimensions(width, height)?;
    if pixels.len() != w * h * 4 {
        return Err(CoreError("Invalid RGBA buffer length"));
    }
    let layer: Value =
        serde_json::from_str(layer_json).map_err(|_| CoreError("Invalid effect JSON"))?;
    validate_effect(&layer)?;
    let seed = seed.wrapping_add(number(&layer, "seedOffset", 0.0) as u32);
    let scale = w as f64 / 540.0;
    let glitch = number(&layer, "glitch", 0.0);
    if glitch > 0.0 {
        let mut rng = Rng::new(seed ^ 0x1a2b3c);
        for k in 0..glitch.ceil() as usize {
            let y = rng.next() * h as f64;
            let rh = (1.0 + rng.next() * 3.0) * scale;
            let x = rng.next() * w as f64 * 0.3;
            let rw = w as f64 * (0.3 + rng.next() * 0.7);
            let a = 0.12 + rng.next() * 0.25;
            let color = if k % 2 == 0 {
                [0.0, 210.0 / 255.0, 1.0]
            } else {
                [1.0, 0.0, 200.0 / 255.0]
            };
            for py in y.floor() as usize..((y + rh).ceil() as usize).min(h) {
                for px in x.floor() as usize..((x + rw).ceil() as usize).min(w) {
                    let coverage = ((py as f64 + 1.0).min(y + rh) - (py as f64).max(y))
                        * ((px as f64 + 1.0).min(x + rw) - (px as f64).max(x));
                    blend(
                        &mut pixels[(py * w + px) * 4..][..4],
                        color,
                        a * coverage,
                        "screen",
                    );
                }
            }
        }
    }
    let scan = number(&layer, "scanlines", 0.0);
    if scan > 0.0 {
        let line = (number(&layer, "scanlineWidth", 1.0) * scale)
            .round()
            .max(1.0) as usize;
        let gap = scale.round().max(1.0) as usize;
        for y in 0..h {
            if y % (line + gap) < line {
                for x in 0..w {
                    blend(
                        &mut pixels[(y * w + x) * 4..][..4],
                        [0.0; 3],
                        scan / 100.0,
                        "normal",
                    );
                }
            }
        }
    }
    let grain = number(&layer, "grain", 0.0);
    if grain > 0.0 {
        let mut rng = Rng::new(seed.wrapping_mul(3331));
        for pixel in pixels.chunks_exact_mut(4) {
            let n = (rng.next() - 0.5) * grain * 3.0;
            let v = byte(128.0 + n) as f64 / 255.0;
            let a = byte(n.abs() * 2.0) as f64 / 255.0 * 0.45;
            blend(pixel, [v; 3], a, "overlay");
        }
    }
    let ca = number(&layer, "ca", 0.0).round();
    if ca > 0.0 {
        let src = pixels.clone();
        let cx = w as f64 / 2.0;
        let cy = h as f64 / 2.0;
        let d = cx.hypot(cy);
        for y in 0..h {
            for x in 0..w {
                let dx = (x as f64 - cx) / d * ca;
                let dy = (y as f64 - cy) / d * ca;
                for (channel, sign) in [(0, 1.0), (2, -1.0)] {
                    let sx = (x as f64 + sign * dx + 0.5)
                        .floor()
                        .clamp(0.0, (w - 1) as f64) as usize;
                    let sy = (y as f64 + sign * dy + 0.5)
                        .floor()
                        .clamp(0.0, (h - 1) as f64) as usize;
                    pixels[(y * w + x) * 4 + channel] = src[(sy * w + sx) * 4 + channel];
                }
            }
        }
    }
    for key in ["noiseWarp", "vortex", "tearAmt"] {
        let amount = number(&layer, key, 0.0);
        if amount <= 0.0 {
            continue;
        }
        let src = pixels.clone();
        for y in 0..h {
            for x in 0..w {
                let u = x as f64 / (w - 1).max(1) as f64;
                let v = y as f64 / (h - 1).max(1) as f64;
                let (su, sv) = match key {
                    "noiseWarp" => {
                        let sx = seed as f64 * 0.001;
                        let sy = seed as f64 * 0.0007;
                        let ox = noise(u * 4.0 + sx, v * 4.0 + sy) - 0.5
                            + (noise(u * 9.0 + sx * 2.0, v * 9.0 + sy * 2.0) - 0.5) * 0.4;
                        let oy = noise(u * 4.0 + sx + 100.0, v * 4.0 + sy + 100.0) - 0.5
                            + (noise(u * 9.0 + sx * 2.0 + 50.0, v * 9.0 + sy * 2.0 + 50.0) - 0.5)
                                * 0.4;
                        (u + ox * amount * 0.0008, v + oy * amount * 0.0008)
                    }
                    "vortex" => {
                        let cx = u - 0.5;
                        let cy = v - 0.5;
                        let d = cx.hypot(cy);
                        let angle = cy.atan2(cx) + amount * 0.03 * (1.0 - d * 2.2).max(0.0);
                        (0.5 + d * angle.cos(), 0.5 + d * angle.sin())
                    }
                    _ => {
                        let chunk = (v / (number(&layer, "tearSize", 3.0) / 1000.0)).floor();
                        let hash =
                            |n: f64| fract((n * 127.1 + seed as f64 * 0.01).sin() * 43758.5453);
                        let shift = if hash(chunk) >= 0.7 {
                            (hash(chunk + 57.3) - 0.5) * 2.0 * amount * 0.007
                        } else {
                            0.0
                        };
                        (fract(u + shift), v)
                    }
                };
                pixels[(y * w + x) * 4..][..4].copy_from_slice(&sample(&src, w, h, su, sv));
            }
        }
    }
    Ok(pixels)
}
