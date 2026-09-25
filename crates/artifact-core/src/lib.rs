//! Shared document-command pilot. No renderer or platform resources.

mod command;
mod editor;
pub mod graph;
mod image;
mod properties;
pub mod render;
mod structure_bridge;
pub use image::ImageProperties;

use serde::{Deserialize, Serialize};
use serde_json::{Number, Value};
use std::collections::HashSet;

const HISTORY_LIMIT: usize = 50;
const MAX_PACKAGE_BYTES: usize = 64 * 1024 * 1024;

#[derive(Debug, Clone, PartialEq, Eq)]
pub struct CoreError(pub &'static str);

impl std::fmt::Display for CoreError {
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        f.write_str(self.0)
    }
}
impl std::error::Error for CoreError {}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct LayerSummary {
    pub id: String,
    pub name: String,
    pub kind: String,
    pub scanlines: Option<f64>,
    pub text: Option<TextProperties>,
    pub image: Option<ImageProperties>,
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct SessionSummary {
    pub layers: Vec<LayerSummary>,
    pub can_undo: bool,
    pub can_redo: bool,
}

#[derive(Serialize, Deserialize)]
pub struct TextProperties {
    pub content: String,
    pub size: f64,
    pub color: String,
    pub x: f64,
    pub y: f64,
}

#[derive(Clone)]
struct FieldEdit {
    key: String,
    before: Option<Value>,
    after: Option<Value>,
}
#[derive(Clone)]
enum ExtendedEdit {
    Group(Vec<Edit>),
    RootFields(Vec<FieldEdit>),
    Section {
        name: &'static str,
        fields: Vec<FieldEdit>,
    },
    Bridge {
        target: command::BridgeTarget,
        before: Option<Value>,
        after: Option<Value>,
    },
    Reorder {
        before: Vec<String>,
        after: Vec<String>,
    },
}
#[derive(Clone)]
struct Edit {
    layer_index: usize,
    layer_id: Option<String>,
    fields: Vec<FieldEdit>,
    structure: Option<editor::StructureEdit>,
    extended: Option<ExtendedEdit>,
}

impl Edit {
    fn retained_bytes(&self) -> usize {
        if let Some(extended) = &self.extended {
            return match extended {
                ExtendedEdit::Group(steps) => steps.iter().map(Edit::retained_bytes).sum(),
                ExtendedEdit::RootFields(fields) => {
                    fields.iter().map(FieldEdit::retained_bytes).sum()
                }
                ExtendedEdit::Section { fields, .. } => {
                    fields.iter().map(FieldEdit::retained_bytes).sum()
                }
                ExtendedEdit::Bridge { before, after, .. } => {
                    before.as_ref().map_or(0, |v| v.to_string().len())
                        + after.as_ref().map_or(0, |v| v.to_string().len())
                }
                ExtendedEdit::Reorder { before, after } => {
                    before.iter().chain(after).map(String::len).sum()
                }
            };
        }
        if let Some(change) = &self.structure {
            return change.bytes();
        }
        self.fields.iter().map(FieldEdit::retained_bytes).sum()
    }
}
impl FieldEdit {
    fn retained_bytes(&self) -> usize {
        self.before.as_ref().map_or(0, |v| v.to_string().len())
            + self.after.as_ref().map_or(0, |v| v.to_string().len())
    }
}

/// Lossless field-preserving package editor, deliberately limited to schema 3
/// and bounded layer-property commands. Existing asset payloads are preserved.
pub struct DocumentSession {
    package: Value,
    past: Vec<Edit>,
    future: Vec<Edit>,
    revision: u64,
    next_transaction_id: u64,
    transaction: Option<command::Transaction>,
    serialized_len: usize,
}

impl DocumentSession {
    fn require_no_transaction(&self) -> Result<(), CoreError> {
        if self.transaction.is_some() {
            Err(CoreError("ACTIVE_TRANSACTION"))
        } else {
            Ok(())
        }
    }

    fn apply_edit(&mut self, edit: &Edit, forward: bool) {
        command::apply_edit_to(&mut self.package["document"], edit, forward);
    }
    pub fn open(source: &str) -> Result<Self, CoreError> {
        if source.len() > MAX_PACKAGE_BYTES {
            return Err(CoreError("Package exceeds the 64 MiB pilot limit"));
        }
        let package: Value =
            serde_json::from_str(source).map_err(|_| CoreError("Invalid project JSON"))?;
        if package["artifactPackage"] != "project"
            || package["manifest"]["kind"] != "artifact-project-package"
            || package["manifest"]["version"] != 1
        {
            return Err(CoreError("Expected an Artifact project package, version 1"));
        }
        let doc = &package["document"];
        if doc["schemaVersion"] != 3 || package["manifest"]["documentSchemaVersion"] != 3 {
            return Err(CoreError(
                "Only document schema 3 is supported by this pilot",
            ));
        }
        if !doc["global"].is_object() || !doc["export"].is_object() {
            return Err(CoreError(
                "Document global and export settings are required",
            ));
        }
        let layers = doc["layers"]
            .as_array()
            .ok_or(CoreError("Document layers must be an array"))?;
        let mut ids = HashSet::new();
        for layer in layers {
            let id = layer["id"]
                .as_str()
                .filter(|id| !id.is_empty())
                .ok_or(CoreError("Every layer must have a nonempty id"))?;
            if !ids.insert(id) {
                return Err(CoreError("Duplicate layer ids are not supported"));
            }
            if layer["kind"]
                .as_str()
                .filter(|kind| !kind.is_empty())
                .is_none()
            {
                return Err(CoreError("Every layer must have a kind"));
            }
        }
        let serialized_len = package.to_string().len();
        Ok(Self {
            package,
            past: Vec::new(),
            future: Vec::new(),
            revision: 0,
            next_transaction_id: 1,
            transaction: None,
            serialized_len,
        })
    }

    pub fn export_json(&self) -> String {
        // Arbitrary-precision numbers preserve existing decimal representations.
        self.package.to_string()
    }

    pub fn can_undo(&self) -> bool {
        self.transaction.is_none() && !self.past.is_empty()
    }
    pub fn can_redo(&self) -> bool {
        self.transaction.is_none() && !self.future.is_empty()
    }

    pub fn summary(&self) -> SessionSummary {
        let layers = self.package["document"]["layers"]
            .as_array()
            .expect("validated layers")
            .iter()
            .map(|layer| LayerSummary {
                id: layer["id"].as_str().expect("validated id").to_owned(),
                name: layer["name"]
                    .as_str()
                    .unwrap_or_else(|| layer["id"].as_str().unwrap())
                    .to_owned(),
                kind: layer["kind"].as_str().expect("validated kind").to_owned(),
                image: image::properties(layer),
                text: (layer["kind"] == "text")
                    .then(|| serde_json::from_value(layer.clone()).ok())
                    .flatten(),
                scanlines: (layer["kind"] == "effect")
                    .then(|| layer["scanlines"].as_f64())
                    .flatten(),
            })
            .collect();
        SessionSummary {
            layers,
            can_undo: self.can_undo(),
            can_redo: self.can_redo(),
        }
    }

    pub fn summary_json(&self) -> String {
        serde_json::to_string(&self.summary()).expect("serializable summary")
    }

    pub fn set_scanlines(&mut self, layer_id: &str, amount: f64) -> Result<bool, CoreError> {
        self.require_no_transaction()?;
        if !amount.is_finite() || !(0.0..=100.0).contains(&amount) {
            return Err(CoreError("Scanlines must be a finite number from 0 to 100"));
        }
        let layers = self.package["document"]["layers"]
            .as_array()
            .expect("validated layers");
        let index = layers
            .iter()
            .position(|layer| layer["id"] == layer_id)
            .ok_or(CoreError("Layer not found"))?;
        let layer = &layers[index];
        if layer["kind"] != "effect" {
            return Err(CoreError(
                "Scanlines can only be changed on an effect layer",
            ));
        }
        let current = layer["scanlines"]
            .as_f64()
            .filter(|value| value.is_finite() && (0.0..=100.0).contains(value))
            .ok_or(CoreError("Layer has no valid Scanlines amount"))?;
        if current == amount {
            return Ok(false);
        }
        self.commit(
            index,
            vec![FieldEdit {
                key: "scanlines".into(),
                before: Some(layer["scanlines"].clone()),
                after: Some(Value::Number(
                    Number::from_f64(amount).expect("finite amount"),
                )),
            }],
        );
        Ok(true)
    }

    /// A partial, atomic patch: one Apply action is one undo step.
    pub fn set_text(&mut self, layer_id: &str, patch_json: &str) -> Result<bool, CoreError> {
        self.require_no_transaction()?;
        if patch_json.len() > 100_000 {
            return Err(CoreError("Text edit is too large"));
        }
        let patch: Value =
            serde_json::from_str(patch_json).map_err(|_| CoreError("Invalid text edit JSON"))?;
        let patch = patch
            .as_object()
            .ok_or(CoreError("Text edit must be an object"))?;
        let layers = self.package["document"]["layers"]
            .as_array()
            .expect("validated layers");
        let index = layers
            .iter()
            .position(|l| l["id"] == layer_id)
            .ok_or(CoreError("Layer not found"))?;
        let layer = &layers[index];
        if layer["kind"] != "text" {
            return Err(CoreError("Text can only be changed on a text layer"));
        }
        let mut fields = Vec::new();
        for (key, value) in patch {
            let valid = match key.as_str() {
                "content" => value
                    .as_str()
                    .is_some_and(|v| v.len() <= 16_384 && !v.contains('\0')),
                "color" => value.as_str().is_some_and(|v| {
                    v.len() == 7
                        && v.starts_with('#')
                        && v[1..].bytes().all(|b| b.is_ascii_hexdigit())
                }),
                "size" => value
                    .as_f64()
                    .is_some_and(|v| v.is_finite() && (1.0..=540.0).contains(&v)),
                "x" | "y" => value
                    .as_f64()
                    .is_some_and(|v| v.is_finite() && (-2.0..=3.0).contains(&v)),
                _ => return Err(CoreError("Unsupported text property")),
            };
            if !valid {
                return Err(CoreError(
                    "Invalid text value: size 1–540, position -2–3, color #RRGGBB, text up to 16 KiB",
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
        self.commit(index, fields);
        Ok(true)
    }

    fn commit(&mut self, index: usize, fields: Vec<FieldEdit>) {
        let layer_id = self.package["document"]["layers"][index]["id"]
            .as_str()
            .map(str::to_owned);
        let growth: i64 = fields
            .iter()
            .map(|field| {
                let after = field.after.as_ref().map_or(0, |v| v.to_string().len()) as i64;
                let before = field.before.as_ref().map_or(0, |v| v.to_string().len()) as i64;
                after - before
                    + if field.before.is_none() {
                        serde_json::to_string(&field.key).unwrap().len() as i64 + 2
                    } else {
                        0
                    }
            })
            .sum();
        for field in &fields {
            if let Some(after) = &field.after {
                self.package["document"]["layers"][index][&field.key] = after.clone();
            }
        }
        let edit = Edit {
            layer_index: index,
            layer_id,
            fields,
            structure: None,
            extended: None,
        };
        self.serialized_len = (self.serialized_len as i64 + growth) as usize;
        self.record_edit(edit);
    }

    fn record_edit(&mut self, edit: Edit) {
        if let Some(tx) = &mut self.transaction {
            tx.steps.push(edit);
            return;
        }
        if self.past.len() == HISTORY_LIMIT {
            self.past.remove(0);
        }
        self.past.push(edit);
        self.future.clear();
        self.revision += 1;
        self.trim_history(MAX_PACKAGE_BYTES);
    }

    fn trim_history(&mut self, max_bytes: usize) {
        while self.past.len() > 1
            && self.past.iter().map(Edit::retained_bytes).sum::<usize>() > max_bytes
        {
            self.past.remove(0);
        }
    }

    pub fn undo(&mut self) -> bool {
        if self.transaction.is_some() {
            return false;
        }
        let Some(edit) = self.past.pop() else {
            return false;
        };
        self.apply_edit(&edit, false);
        self.future.push(edit);
        self.revision += 1;
        self.serialized_len = self.package.to_string().len();
        true
    }

    pub fn redo(&mut self) -> bool {
        if self.transaction.is_some() {
            return false;
        }
        let Some(edit) = self.future.pop() else {
            return false;
        };
        self.apply_edit(&edit, true);
        self.past.push(edit);
        self.revision += 1;
        self.serialized_len = self.package.to_string().len();
        true
    }
}

#[cfg(test)]
mod history_tests {
    use super::*;
    #[test]
    fn byte_budget_evicts_oldest_but_keeps_latest_undo() {
        let mut session = DocumentSession {
            package: Value::Null,
            past: Vec::new(),
            future: Vec::new(),
            revision: 0,
            next_transaction_id: 1,
            transaction: None,
            serialized_len: 0,
        };
        for index in 0..3 {
            session.past.push(Edit {
                layer_index: index,
                layer_id: None,
                structure: None,
                extended: None,
                fields: vec![FieldEdit {
                    key: "src".into(),
                    before: Some(Value::String("old".repeat(10))),
                    after: Some(Value::String("new".repeat(10))),
                }],
            });
        }
        session.trim_history(128);
        assert_eq!(session.past.len(), 2);
        assert_eq!(session.past[0].layer_index, 1);
        session.trim_history(1);
        assert_eq!(session.past.len(), 1);
        assert_eq!(session.past[0].layer_index, 2);
    }
}
