use crate::{CoreError, DocumentSession, FieldEdit, MAX_PACKAGE_BYTES};
use base64::{Engine, engine::general_purpose::STANDARD};
use serde::Serialize;
use serde_json::Value;

const MAX_PNG_BYTES: usize = 16 * 1024 * 1024;
const MAX_IMAGE_PATCH: usize = MAX_PNG_BYTES * 4 / 3 + 4096;

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
// it is not a PNG pixel decoder. Existing package payloads are not rewritten.
pub(crate) fn validate_source(value: &Value) -> Result<(), CoreError> {
    let encoded = value
        .as_str()
        .and_then(|s| s.strip_prefix("data:image/png;base64,"))
        .ok_or(CoreError("Replacement must be an embedded PNG"))?;
    let bytes = STANDARD
        .decode(encoded)
        .map_err(|_| CoreError("Invalid PNG base64"))?;
    if bytes.len() > MAX_PNG_BYTES
        || bytes.len() < 45
        || !bytes.starts_with(b"\x89PNG\r\n\x1a\n\0\0\0\rIHDR")
        || !bytes.ends_with(b"\0\0\0\0IEND\xaeB`\x82")
    {
        return Err(CoreError("Invalid PNG envelope or image exceeds 16 MiB"));
    }
    let width = u32::from_be_bytes(bytes[16..20].try_into().unwrap());
    let height = u32::from_be_bytes(bytes[20..24].try_into().unwrap());
    if width == 0 || height == 0 || width > 4096 || height > 4096 {
        return Err(CoreError(
            "Replacement image dimensions must be 1–4096 pixels",
        ));
    }
    Ok(())
}

impl DocumentSession {
    /// One atomic replacement/transform command. Payloads never enter summaries.
    pub fn set_image(&mut self, layer_id: &str, patch_json: &str) -> Result<bool, CoreError> {
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
                    after: value.clone(),
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
                f.after.to_string().len() as i64
                    - f.before.as_ref().map_or(0, |v| v.to_string().len()) as i64
                    + if f.before.is_none() {
                        f.key.len() as i64 + 4
                    } else {
                        0
                    }
            })
            .sum();
        if self.export_json().len() as i64 + growth > MAX_PACKAGE_BYTES as i64 {
            return Err(CoreError(
                "Replacement would exceed the 64 MiB package limit",
            ));
        }
        self.commit(index, fields);
        Ok(true)
    }
}
