use crate::{CoreError, DocumentSession, FieldEdit, MAX_PACKAGE_BYTES};
use base64::{Engine, engine::general_purpose::STANDARD};
use serde::Serialize;
use serde_json::Value;

const MAX_IMAGE_BYTES: usize = 16 * 1024 * 1024;
const MAX_IMAGE_PATCH: usize = MAX_IMAGE_BYTES * 4 / 3 + 4096;

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ImageProperties {
    pub x: f64,
    pub y: f64,
    pub scale_x: f64,
    pub scale_y: f64,
    pub rotation: f64,
}

pub(crate) fn properties(layer: &Value) -> Option<ImageProperties> {
    if layer["kind"] != "image" {
        return None;
    }
    Some(ImageProperties {
        x: layer["x"].as_f64().unwrap_or(0.0),
        y: layer["y"].as_f64().unwrap_or(0.0),
        scale_x: layer["scaleX"].as_f64().unwrap_or(1.0),
        scale_y: layer["scaleY"].as_f64().unwrap_or(1.0),
        rotation: layer["rotation"].as_f64().unwrap_or(0.0),
    })
}

// Decode only the fixed PNG header for lightweight editor geometry.
pub(crate) fn dimensions(layer: &Value) -> Option<(u32, u32)> {
    let encoded = layer["src"]
        .as_str()?
        .strip_prefix("data:image/png;base64,")?;
    let bytes = STANDARD.decode(encoded.get(..32)?).ok()?;
    if !bytes.starts_with(b"\x89PNG\r\n\x1a\n\0\0\0\rIHDR") {
        return None;
    }
    let width = u32::from_be_bytes(bytes[16..20].try_into().ok()?);
    let height = u32::from_be_bytes(bytes[20..24].try_into().ok()?);
    (width > 0 && height > 0).then_some((width, height))
}

// Platform importers fully decode and normalize PNG/JPEG (including orientation)
// before calling this command. Core checks the portable envelope and bounds;
// it is not a pixel decoder. Existing package payloads are not rewritten.
pub(crate) fn validate_source(value: &Value) -> Result<(), CoreError> {
    if let Some(reference) = value
        .as_str()
        .and_then(|s| s.strip_prefix("artifact-asset://"))
    {
        if !reference.is_empty()
            && reference.len() <= 200
            && reference
                .bytes()
                .all(|b| b.is_ascii_alphanumeric() || matches!(b, b'-' | b'_' | b'.'))
        {
            return Ok(());
        }
        return Err(CoreError("Invalid asset reference"));
    }
    let source = value.as_str().ok_or(CoreError("Invalid image source"))?;
    let (encoded, format) = if let Some(encoded) = source.strip_prefix("data:image/png;base64,") {
        (encoded, "png")
    } else if let Some(encoded) = source.strip_prefix("data:image/jpeg;base64,") {
        (encoded, "jpeg")
    } else {
        return Err(CoreError("Replacement must be an embedded PNG or JPEG"));
    };
    let bytes = STANDARD
        .decode(encoded)
        .map_err(|_| CoreError("Invalid image base64"))?;
    if bytes.len() > MAX_IMAGE_BYTES {
        return Err(CoreError("Image exceeds 16 MiB"));
    }
    let (width, height) = if format == "png" {
        if bytes.len() < 45
            || !bytes.starts_with(b"\x89PNG\r\n\x1a\n\0\0\0\rIHDR")
            || !bytes.ends_with(b"\0\0\0\0IEND\xaeB`\x82")
        {
            return Err(CoreError("Invalid PNG envelope"));
        }
        (
            u32::from_be_bytes(bytes[16..20].try_into().unwrap()),
            u32::from_be_bytes(bytes[20..24].try_into().unwrap()),
        )
    } else {
        jpeg_dimensions(&bytes).ok_or(CoreError("Invalid JPEG envelope"))?
    };
    if width == 0 || height == 0 || width > 4096 || height > 4096 {
        return Err(CoreError(
            "Replacement image dimensions must be 1–4096 pixels",
        ));
    }
    Ok(())
}

fn jpeg_dimensions(bytes: &[u8]) -> Option<(u32, u32)> {
    if !bytes.starts_with(&[0xff, 0xd8]) || !bytes.ends_with(&[0xff, 0xd9]) {
        return None;
    }
    let mut index = 2;
    while index + 4 <= bytes.len() {
        if bytes[index] != 0xff {
            return None;
        }
        while bytes.get(index) == Some(&0xff) {
            index += 1;
        }
        let marker = *bytes.get(index)?;
        index += 1;
        if marker == 0xd9 || marker == 0xda {
            return None; // A frame must precede the scan and end marker.
        }
        if marker == 0x01 || (0xd0..=0xd7).contains(&marker) {
            continue;
        }
        let length = u16::from_be_bytes([*bytes.get(index)?, *bytes.get(index + 1)?]) as usize;
        if length < 2 || index.checked_add(length)? > bytes.len() {
            return None;
        }
        if matches!(marker, 0xc0..=0xc3 | 0xc5..=0xc7 | 0xc9..=0xcb | 0xcd..=0xcf) {
            if length < 7 {
                return None;
            }
            let height = u16::from_be_bytes([bytes[index + 3], bytes[index + 4]]) as u32;
            let width = u16::from_be_bytes([bytes[index + 5], bytes[index + 6]]) as u32;
            return Some((width, height));
        }
        index += length;
    }
    None
}

impl DocumentSession {
    /// One atomic replacement/transform command. Payloads never enter summaries.
    pub fn set_image(&mut self, layer_id: &str, patch_json: &str) -> Result<bool, CoreError> {
        self.require_no_transaction()?;
        if patch_json.len() > MAX_IMAGE_PATCH {
            return Err(CoreError("Image edit is too large"));
        }
        let patch: Value =
            serde_json::from_str(patch_json).map_err(|_| CoreError("Invalid image edit JSON"))?;
        let patch = patch
            .as_object()
            .ok_or(CoreError("Image edit must be an object"))?;
        let layers = self.package["document"]["layers"].as_array().unwrap();
        let index = layers
            .iter()
            .position(|l| l["id"] == layer_id)
            .ok_or(CoreError("Layer not found"))?;
        let layer = &layers[index];
        if layer["kind"] != "image" {
            return Err(CoreError("Image properties require an image layer"));
        }
        let mut fields = Vec::new();
        for (key, value) in patch {
            let range = match key.as_str() {
                "src" => {
                    validate_source(value)?;
                    None
                }
                "x" | "y" => Some(-2.0..=3.0),
                "scaleX" | "scaleY" => Some(0.01..=10.0),
                "rotation" => Some(-360.0..=360.0),
                _ => return Err(CoreError("Unsupported image property")),
            };
            if let Some(range) = range
                && !value
                    .as_f64()
                    .is_some_and(|v| v.is_finite() && range.contains(&v))
            {
                return Err(CoreError(
                    "Invalid image value: position -2–3, scale 0.01–10, angle -360–360",
                ));
            }
            let before = layer.get(key).cloned();
            let equal = before.as_ref() == Some(value)
                || (value.is_number() && before.as_ref().and_then(Value::as_f64) == value.as_f64());
            if !equal {
                fields.push(FieldEdit {
                    key: key.clone(),
                    before,
                    after: Some(value.clone()),
                });
            }
        }
        if fields.is_empty() {
            return Ok(false);
        }
        // Account for serialized growth before committing; rejected imports keep
        // the current document and redo branch completely intact.
        let growth: i64 = fields
            .iter()
            .map(|f| {
                f.after.as_ref().map_or(0, |v| v.to_string().len()) as i64
                    - f.before.as_ref().map_or(0, |v| v.to_string().len()) as i64
                    + if f.before.is_none() {
                        f.key.len() as i64 + 4
                    } else {
                        0
                    }
            })
            .sum();
        if self.serialized_len as i64 + growth > MAX_PACKAGE_BYTES as i64 {
            return Err(CoreError(
                "Replacement would exceed the 64 MiB package limit",
            ));
        }
        self.commit(index, fields);
        Ok(true)
    }
}
