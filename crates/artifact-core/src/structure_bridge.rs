//! Cold Web structure handoff. Web validates graph ports/cycles before submission;
//! this boundary validates identity, ownership and package shape, then journals
//! the candidate in the same session history.
use crate::command::{CommandError, validate_graph};
use crate::editor::StructureEdit;
use crate::{DocumentSession, Edit, MAX_PACKAGE_BYTES};
use serde::Deserialize;
use serde_json::Value;
use std::collections::{HashMap, HashSet};

#[derive(Debug, Clone, Deserialize)]
#[serde(deny_unknown_fields)]
pub struct GraphCandidate {
    pub present: bool,
    #[serde(default)]
    pub value: Value,
}

fn invalid(message: &'static str) -> CommandError {
    CommandError::new("INVALID_VALUE", message)
}

fn allowed_new_kind(kind: &str) -> bool {
    matches!(
        kind,
        "text"
            | "image"
            | "emoji"
            | "effect"
            | "fill"
            | "primitive"
            | "noise"
            | "array"
            | "lineField"
            | "model"
    )
}

fn validate_layers(before: &[Value], after: &[Value]) -> Result<(), CommandError> {
    let old: HashMap<&str, &Value> = before
        .iter()
        .filter_map(|v| v["id"].as_str().map(|id| (id, v)))
        .collect();
    let mut seen = HashSet::new();
    for layer in after {
        let id = layer["id"]
            .as_str()
            .filter(|id| !id.is_empty())
            .ok_or_else(|| invalid("Every candidate layer needs a valid id"))?;
        let kind = layer["kind"]
            .as_str()
            .filter(|kind| !kind.is_empty())
            .ok_or_else(|| invalid("Every candidate layer needs a kind"))?;
        if !layer.is_object() || !seen.insert(id) {
            return Err(invalid("Duplicate or invalid candidate layer"));
        }
        if let Some(previous) = old.get(id) {
            if *previous != layer {
                return Err(CommandError::new(
                    "UNSUPPORTED_CAPABILITY",
                    "Structure bridge cannot edit retained layer fields",
                ));
            }
        } else {
            if id.len() > 200 || id == "__export__" {
                return Err(invalid("New layer id is invalid"));
            }
            if !allowed_new_kind(kind) {
                return Err(CommandError::new(
                    "UNSUPPORTED_CAPABILITY",
                    "New layer kind is not a current Web kind",
                ));
            }
        }
    }
    for layer in before {
        if layer["locked"] == true && !seen.contains(layer["id"].as_str().unwrap()) {
            return Err(CommandError::new(
                "LOCKED_LAYER",
                "Unlock the layer before deleting it",
            ));
        }
    }
    // Add/delete may shift an absolute index. Reordering existing survivors may
    // not change a locked survivor's relative index among those survivors.
    let old_survivors: Vec<&str> = before
        .iter()
        .filter_map(|v| v["id"].as_str())
        .filter(|id| seen.contains(id))
        .collect();
    let new_survivors: Vec<&str> = after
        .iter()
        .filter_map(|v| v["id"].as_str())
        .filter(|id| old.contains_key(id))
        .collect();
    for (index, id) in old_survivors.iter().enumerate() {
        if old[id]["locked"] == true
            && new_survivors.iter().position(|candidate| candidate == id) != Some(index)
        {
            return Err(CommandError::new(
                "LOCKED_LAYER",
                "Unlock layers before reordering them",
            ));
        }
    }
    Ok(())
}

fn validate_web_graph_shape(before: Option<&Value>, candidate: &Value) -> Result<(), CommandError> {
    let graph = candidate.as_object().unwrap();
    if !graph.get("positions").is_some_and(Value::is_object)
        || !graph.get("mergeNodes").is_some_and(Value::is_array)
        || !graph.get("colorNodes").is_some_and(Value::is_array)
        || graph.get("areas").is_some_and(|value| !value.is_array())
        || graph
            .get("primitiveViewStates")
            .is_some_and(|value| !value.is_object())
    {
        return Err(invalid(
            "Web graph candidate has invalid required structure",
        ));
    }
    if let Some(previous) = before.and_then(Value::as_object) {
        for (key, value) in previous {
            if !matches!(
                key.as_str(),
                "edges"
                    | "positions"
                    | "mergeNodes"
                    | "colorNodes"
                    | "repeatNodes"
                    | "maskNodes"
                    | "transformNodes"
                    | "grimeShadowNodes"
                    | "scene3dNodes"
                    | "environmentNodes"
                    | "materialNodes"
                    | "shaderNodes"
                    | "areas"
                    | "primitiveViewStates"
            ) && graph.get(key) != Some(value)
            {
                return Err(CommandError::new(
                    "UNSUPPORTED_CAPABILITY",
                    "Structure candidate must preserve unknown graph fields",
                ));
            }
            if crate::editor::GRAPH_LISTS.contains(&key.as_str()) {
                if let (Some(old_nodes), Some(new_nodes)) =
                    (value.as_array(), graph.get(key).and_then(Value::as_array))
                {
                    for old in old_nodes {
                        if let Some(new) = new_nodes.iter().find(|new| new["id"] == old["id"]) {
                            if old != new {
                                return Err(CommandError::new(
                                    "UNSUPPORTED_CAPABILITY",
                                    "Structure candidate must preserve retained graph node values",
                                ));
                            }
                        }
                    }
                }
            }
        }
    }
    Ok(())
}

impl DocumentSession {
    pub(crate) fn bridge_structure(
        &mut self,
        capability: &str,
        mut layers: Vec<Value>,
        graph: GraphCandidate,
    ) -> Result<(), CommandError> {
        if capability != "web:structure" {
            return Err(CommandError::new(
                "UNSUPPORTED_CAPABILITY",
                "Structure bridge requires web:structure",
            ));
        }
        if !graph.present && !graph.value.is_null() {
            return Err(invalid("Absent graph cannot carry a value"));
        }
        let doc = &self.package["document"];
        let before_layers = doc["layers"].as_array().unwrap();
        validate_layers(before_layers, &layers)?;
        // A Web candidate may serialize unchanged survivors with a different
        // object-key order. Keep the original values so Undo and byte-stable
        // export do not acquire an incidental field-order rewrite.
        for layer in &mut layers {
            if let Some(previous) = before_layers.iter().find(|old| old["id"] == layer["id"]) {
                *layer = previous.clone();
            }
        }
        let before_graph = doc.get("graph");
        let after_graph = graph.present.then_some(&graph.value);
        if let Some(candidate) = after_graph.filter(|value| !value.is_null()) {
            if !candidate.is_object() {
                return Err(invalid("Graph must be an object or null"));
            }
            validate_graph(&layers, candidate)?;
            validate_web_graph_shape(before_graph, candidate)?;
        }
        if before_layers == &layers && before_graph == after_graph {
            return Ok(());
        }
        let before_bytes = Value::Array(before_layers.clone()).to_string().len() as i64
            + before_graph.map_or(0, |value| value.to_string().len() + "\"graph\":".len() + 1)
                as i64;
        let after_bytes = Value::Array(layers.clone()).to_string().len() as i64
            + after_graph.map_or(0, |value| value.to_string().len() + "\"graph\":".len() + 1)
                as i64;
        let next_size = self.serialized_len as i64 + after_bytes - before_bytes;
        if next_size > MAX_PACKAGE_BYTES as i64 {
            return Err(CommandError::new(
                "PACKAGE_LIMIT",
                "Project would exceed 64 MiB",
            ));
        }
        let edit = StructureEdit::between(before_layers, &layers, before_graph, after_graph);
        let doc = &mut self.package["document"];
        doc["layers"] = Value::Array(layers);
        if let Some(value) = after_graph {
            doc["graph"] = value.clone();
        } else {
            doc.as_object_mut().unwrap().remove("graph");
        }
        self.serialized_len = next_size as usize;
        self.record_edit(Edit {
            layer_index: 0,
            layer_id: None,
            fields: Vec::new(),
            structure: Some(edit),
            extended: None,
        });
        Ok(())
    }
}
