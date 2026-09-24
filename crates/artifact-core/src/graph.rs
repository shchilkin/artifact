//! Pure 2D graph edits and target dependencies. The document stays JSON data;
//! rendering resources and node-canvas view state never enter this module.
use crate::command::{CommandError, validate_graph};
use crate::editor::StructureEdit;
use crate::{DocumentSession, Edit, MAX_PACKAGE_BYTES};
use serde::Deserialize;
use serde_json::{Map, Value, json};
use std::collections::{BTreeMap, BTreeSet, HashSet, VecDeque};

pub const OUTPUT_ID: &str = "__export__";
const KINDS: &[(&str, &str)] = &[
    ("merge", "mergeNodes"),
    ("color", "colorNodes"),
    ("repeat", "repeatNodes"),
    ("mask", "maskNodes"),
    ("transform", "transformNodes"),
    ("grimeShadow", "grimeShadowNodes"),
];

#[derive(Debug, Clone, Deserialize)]
#[serde(tag = "kind", rename_all = "snake_case")]
pub enum GraphAction {
    AddNode {
        collection: String,
        node: Value,
        position: Value,
    },
    PatchNode {
        id: String,
        patch: Map<String, Value>,
    },
    RemoveNodes {
        ids: Vec<String>,
    },
    DuplicateNodes {
        copies: Vec<NodeCopy>,
    },
    SetPositions {
        positions: BTreeMap<String, Value>,
    },
    AddEdge {
        edge: Value,
    },
    RemoveEdges {
        ids: Vec<String>,
    },
    ReconnectEdge {
        id: String,
        from_id: String,
        to_id: String,
        to_port: String,
    },
    SplitEdge {
        id: String,
        node_id: String,
        input_port: String,
    },
    AddArea {
        area: Value,
    },
    PatchArea {
        id: String,
        patch: Map<String, Value>,
    },
    RemoveArea {
        id: String,
    },
    AssignArea {
        id: String,
        node_ids: Vec<String>,
    },
}
#[derive(Debug, Clone, Deserialize)]
pub struct NodeCopy {
    pub id: String,
    pub new_id: String,
}

fn err(code: &'static str, msg: &'static str) -> CommandError {
    CommandError::new(code, msg)
}
fn invalid(msg: &'static str) -> CommandError {
    err("INVALID_VALUE", msg)
}
fn target(msg: &'static str) -> CommandError {
    err("INVALID_TARGET", msg)
}
fn collection(name: &str) -> Result<&'static str, CommandError> {
    KINDS
        .iter()
        .find(|(kind, list)| *kind == name || *list == name)
        .map(|(_, list)| *list)
        .ok_or_else(|| {
            err(
                "UNSUPPORTED_CAPABILITY",
                "Graph node kind is not a shared 2D utility",
            )
        })
}
fn id(value: &Value) -> Result<&str, CommandError> {
    value
        .as_str()
        .filter(|v| !v.is_empty() && v.len() <= 200 && *v != OUTPUT_ID)
        .ok_or_else(|| invalid("Graph ID must be nonempty and at most 200 characters"))
}
fn valid_position(v: &Value) -> bool {
    v.as_object().is_some_and(|o| {
        ["x", "y"].iter().all(|k| {
            o.get(*k)
                .and_then(Value::as_f64)
                .is_some_and(f64::is_finite)
        })
    })
}
fn graph_mut(doc: &mut Value) -> Result<&mut Value, CommandError> {
    let graph = doc
        .get_mut("graph")
        .filter(|g| g.is_object())
        .ok_or_else(|| target("Explicit graph is required; stack mode has separate semantics"))?;
    if !graph["edges"].is_array() || !graph["positions"].is_object() {
        return Err(invalid("Graph edges and positions are required"));
    }
    Ok(graph)
}
fn lists(graph: &Value) -> Vec<(&'static str, &Value)> {
    KINDS
        .iter()
        .filter_map(|(_, list)| graph.get(*list).map(|v| (*list, v)))
        .collect()
}
fn utility_location(graph: &Value, id: &str) -> Option<(&'static str, usize)> {
    lists(graph).into_iter().find_map(|(list, nodes)| {
        nodes
            .as_array()
            .and_then(|a| a.iter().position(|n| n["id"] == id).map(|i| (list, i)))
    })
}
fn node_exists(doc: &Value, id: &str) -> bool {
    id == OUTPUT_ID
        || doc["layers"]
            .as_array()
            .is_some_and(|a| a.iter().any(|n| n["id"] == id))
        || crate::command::graph_node_ids(&doc["graph"]).contains(&id)
}
pub(crate) fn node_type(doc: &Value, id: &str) -> Option<String> {
    if id == OUTPUT_ID {
        return Some("output".into());
    }
    if let Some(layer) = doc["layers"].as_array()?.iter().find(|n| n["id"] == id) {
        let kind = layer["kind"].as_str().unwrap_or("unknown");
        if !matches!(
            kind,
            "text" | "image" | "fill" | "emoji" | "effect" | "noise" | "array" | "lineField"
        ) {
            return None;
        }
        return Some(format!("layer:{kind}"));
    }
    for (kind, list) in KINDS {
        if doc["graph"][list]
            .as_array()
            .is_some_and(|a| a.iter().any(|n| n["id"] == id))
        {
            return Some((*kind).into());
        }
    }
    None
}
fn valid_target_port(kind: &str, port: &str) -> bool {
    match kind {
        "output" | "color" | "transform" | "grimeShadow" => port == "in",
        "repeat" => matches!(port, "in" | "bg"),
        "merge" => matches!(port, "a" | "b"),
        "mask" => matches!(port, "in" | "mask"),
        "layer:effect" => port == "in",
        k if k.starts_with("layer:") => port == "bg",
        _ => false,
    }
}
fn edge_fields(edge: &Value) -> Result<(&str, &str, &str, &str, &str), CommandError> {
    Ok((
        id(&edge["id"])?,
        id(&edge["fromId"])?,
        edge["fromPort"]
            .as_str()
            .ok_or_else(|| invalid("Source port is required"))?,
        edge["toId"]
            .as_str()
            .filter(|s| !s.is_empty())
            .ok_or_else(|| invalid("Target is required"))?,
        edge["toPort"]
            .as_str()
            .ok_or_else(|| invalid("Target port is required"))?,
    ))
}
fn validate_new_edge(doc: &Value, edge: &Value) -> Result<(), CommandError> {
    let (_, from, from_port, to, to_port) = edge_fields(edge)?;
    if from_port != "out" || from == OUTPUT_ID || !node_exists(doc, from) || !node_exists(doc, to) {
        return Err(target("Invalid graph edge endpoint or source port"));
    }
    let kind = node_type(doc, to).ok_or_else(|| {
        err(
            "UNSUPPORTED_CAPABILITY",
            "Unsupported graph target is not editable",
        )
    })?;
    if node_type(doc, from).is_none() || !valid_target_port(&kind, to_port) {
        return Err(invalid("Invalid graph target port"));
    }
    Ok(())
}
pub(crate) fn validate_old_edge_editable(doc: &Value, edge: &Value) -> Result<(), CommandError> {
    let (_, from, _, to, _) = edge_fields(edge)?;
    if node_type(doc, from).is_none() || node_type(doc, to).is_none() {
        return Err(err(
            "UNSUPPORTED_CAPABILITY",
            "Unsupported graph edge is not editable",
        ));
    }
    Ok(())
}
fn cycle(edges: &[Value]) -> bool {
    let mut next: BTreeMap<&str, Vec<&str>> = BTreeMap::new();
    for edge in edges {
        if let (Some(a), Some(b)) = (edge["fromId"].as_str(), edge["toId"].as_str()) {
            next.entry(a).or_default().push(b);
        }
    }
    let mut gray = HashSet::new();
    let mut black = HashSet::new();
    fn visit<'a>(
        id: &'a str,
        next: &BTreeMap<&'a str, Vec<&'a str>>,
        gray: &mut HashSet<&'a str>,
        black: &mut HashSet<&'a str>,
    ) -> bool {
        if black.contains(id) {
            return false;
        }
        if !gray.insert(id) {
            return true;
        }
        if next
            .get(id)
            .is_some_and(|targets| targets.iter().any(|n| visit(n, next, gray, black)))
        {
            return true;
        }
        gray.remove(id);
        black.insert(id);
        false
    }
    next.keys()
        .copied()
        .any(|n| visit(n, &next, &mut gray, &mut black))
}
fn insert_edge(doc: &mut Value, edge: Value) -> Result<(), CommandError> {
    validate_new_edge(doc, &edge)?;
    let (edge_id, _, _, to, port) = edge_fields(&edge)?;
    let edges = doc["graph"]["edges"].as_array().unwrap();
    if edges.iter().any(|e| e["id"] == edge_id) {
        return Err(invalid("Duplicate graph edge ID"));
    }
    for existing in edges
        .iter()
        .filter(|e| e["toId"] == to && e["toPort"] == port)
    {
        validate_old_edge_editable(doc, existing)?;
    }
    let mut next: Vec<Value> = edges
        .iter()
        .filter(|e| !(e["toId"] == to && e["toPort"] == port))
        .cloned()
        .collect();
    next.push(edge);
    if cycle(&next) {
        return Err(invalid("Connection would create a cycle"));
    }
    doc["graph"]["edges"] = Value::Array(next);
    Ok(())
}
fn remove_node_references(graph: &mut Value, ids: &HashSet<String>) {
    graph["edges"].as_array_mut().unwrap().retain(|e| {
        !ids.contains(e["fromId"].as_str().unwrap_or(""))
            && !ids.contains(e["toId"].as_str().unwrap_or(""))
    });
    if let Some(pos) = graph["positions"].as_object_mut() {
        for id in ids {
            pos.remove(id);
        }
    }
    if let Some(areas) = graph["areas"].as_array_mut() {
        for area in areas {
            if let Some(nodes) = area["nodeIds"].as_array_mut() {
                nodes.retain(|v| !ids.contains(v.as_str().unwrap_or("")));
            }
        }
    }
}
fn assign_area_nodes(graph: &mut Value, area_id: &str, node_ids: &[String]) {
    let moving: HashSet<&str> = node_ids.iter().map(String::as_str).collect();
    if let Some(areas) = graph["areas"].as_array_mut() {
        for area in areas.iter_mut() {
            if area["id"] == area_id {
                continue;
            }
            if let Some(nodes) = area["nodeIds"].as_array_mut() {
                nodes.retain(|id| !moving.contains(id.as_str().unwrap_or("")));
            }
        }
        areas.retain(|area| {
            area["id"] == area_id || area["nodeIds"].as_array().is_none_or(|ids| !ids.is_empty())
        });
    }
}
fn unique_ids(ids: &[Value]) -> Vec<Value> {
    let mut seen = HashSet::new();
    ids.iter()
        .filter(|value| value.as_str().is_some_and(|id| seen.insert(id.to_owned())))
        .cloned()
        .collect()
}
fn node_defaults(list: &str) -> Value {
    match list {
        "mergeNodes" => json!({"name":"Merge","blendMode":"source-over","opacity":100}),
        "colorNodes" => {
            json!({"name":"Color","contrast":100,"brightness":100,"saturation":100,"hue":0})
        }
        "repeatNodes" => {
            json!({"name":"Repeater","pattern":"grid","count":4,"rows":3,"gap":120,"radius":90,"scale":28,"jitter":0,"rotation":0,"rotationMode":"fixed","rotationStep":0,"rotationJitter":0,"seedOffset":0,"opacity":58,"blendMode":"screen"})
        }
        "maskNodes" => {
            json!({"name":"Mask","mode":"alpha","invert":false,"threshold":50,"feather":0,"expand":0,"opacity":100})
        }
        "transformNodes" => {
            json!({"name":"Transform","x":0,"y":0,"scaleX":100,"scaleY":100,"uniformScale":true,"rotation":0,"pivotMode":"canvas","opacity":100})
        }
        "grimeShadowNodes" => {
            json!({"name":"Grime Shadow","x":8,"y":10,"layers":5,"blur":10,"spread":14,"grime":45,"jitter":10,"opacity":58,"color":"#090606","seedOffset":0,"shadowOnly":false})
        }
        _ => unreachable!("validated 2D collection"),
    }
}
fn valid_number(value: &Value, min: f64, max: f64, integer: bool) -> bool {
    value
        .as_f64()
        .is_some_and(|n| n.is_finite() && n >= min && n <= max && (!integer || n.fract() == 0.0))
}
fn valid_node_field(list: &str, key: &str, value: &Value) -> Option<bool> {
    let choice = |options: &[&str]| value.as_str().is_some_and(|v| options.contains(&v));
    let number = |min, max, integer| valid_number(value, min, max, integer);
    Some(match key {
        "name" => value
            .as_str()
            .is_some_and(|s| !s.is_empty() && s.len() <= 256 && !s.contains('\0')),
        "blendMode" if matches!(list, "mergeNodes" | "repeatNodes") => choice(&[
            "source-over",
            "normal",
            "multiply",
            "screen",
            "overlay",
            "luminosity",
        ]),
        "pattern" if list == "repeatNodes" => choice(&["line", "grid", "radial"]),
        "rotationMode" if list == "repeatNodes" => choice(&["fixed", "radial", "step", "random"]),
        "mode" if list == "maskNodes" => choice(&["alpha", "luma", "threshold"]),
        "pivotMode" if list == "transformNodes" => choice(&["canvas", "visible"]),
        "color" if list == "grimeShadowNodes" => value.as_str().is_some_and(|s| {
            s.len() == 7 && s.starts_with('#') && s[1..].bytes().all(|b| b.is_ascii_hexdigit())
        }),
        "invert" if list == "maskNodes" => value.is_boolean(),
        "uniformScale" if list == "transformNodes" => value.is_boolean(),
        "shadowOnly" if list == "grimeShadowNodes" => value.is_boolean(),
        "opacity" => number(0.0, 100.0, false),
        "contrast" | "brightness" | "saturation" if list == "colorNodes" => {
            number(0.0, 200.0, false)
        }
        "hue" if list == "colorNodes" => number(-180.0, 180.0, false),
        "count" if list == "repeatNodes" => number(1.0, 96.0, true),
        "rows" if list == "repeatNodes" => number(1.0, 48.0, true),
        "gap" if list == "repeatNodes" => number(12.0, 480.0, false),
        "radius" if list == "repeatNodes" => number(0.0, 480.0, false),
        "scale" if list == "repeatNodes" => number(4.0, 300.0, false),
        "jitter" if list == "repeatNodes" => number(0.0, 260.0, false),
        "rotation" | "rotationStep" if list == "repeatNodes" => number(-180.0, 180.0, false),
        "rotationJitter" if list == "repeatNodes" => number(0.0, 180.0, false),
        "seedOffset" if matches!(list, "repeatNodes" | "grimeShadowNodes") => {
            number(-9999.0, 9999.0, true)
        }
        "threshold" if list == "maskNodes" => number(0.0, 100.0, false),
        "feather" if list == "maskNodes" => number(0.0, 160.0, false),
        "expand" if list == "maskNodes" => number(0.0, 120.0, false),
        "x" | "y" if list == "transformNodes" => number(-240.0, 240.0, false),
        "scaleX" | "scaleY" if list == "transformNodes" => number(1.0, 500.0, false),
        "rotation" if list == "transformNodes" => number(-180.0, 180.0, false),
        "x" | "y" if list == "grimeShadowNodes" => number(-260.0, 260.0, false),
        "layers" if list == "grimeShadowNodes" => number(1.0, 32.0, true),
        "blur" if list == "grimeShadowNodes" => number(0.0, 160.0, false),
        "spread" | "jitter" if list == "grimeShadowNodes" => number(0.0, 220.0, false),
        "grime" if list == "grimeShadowNodes" => number(0.0, 100.0, false),
        _ => return None,
    })
}
fn validate_node_patch(list: &str, patch: &Map<String, Value>) -> Result<(), CommandError> {
    for (key, value) in patch {
        match valid_node_field(list, key, value) {
            Some(true) => {}
            Some(false) => return Err(invalid("Invalid graph node field value")),
            None => {
                return Err(err(
                    "UNSUPPORTED_CAPABILITY",
                    "Field is not a shared 2D graph control",
                ));
            }
        }
    }
    Ok(())
}
fn validate_area(area: &Value, doc: &Value) -> Result<(), CommandError> {
    id(&area["id"])?;
    if area["name"].as_str().is_none_or(|s| s.len() > 256)
        || area["color"].as_str().is_none_or(|s| s.len() > 64)
        || !area["nodeIds"].as_array().is_some_and(|a| {
            a.iter().all(|v| {
                v.as_str()
                    .is_some_and(|id| id != OUTPUT_ID && node_type(doc, id).is_some())
            })
        })
        || area.get("collapsed").is_some_and(|v| !v.is_boolean())
    {
        return Err(invalid("Invalid graph area"));
    }
    Ok(())
}
fn apply(doc: &mut Value, action: GraphAction) -> Result<(), CommandError> {
    graph_mut(doc)?;
    match action {
        GraphAction::AddNode {
            collection: kind,
            node,
            position,
        } => {
            let list = collection(&kind)?;
            let new_id = id(&node["id"])?.to_owned();
            if !node.is_object() || !valid_position(&position) || node_exists(doc, &new_id) {
                return Err(invalid("Invalid or duplicate graph node"));
            }
            let mut created = node_defaults(list);
            for (key, value) in node.as_object().unwrap() {
                if key != "id" && created.get(key).is_some() {
                    let mut patch = Map::new();
                    patch.insert(key.clone(), value.clone());
                    validate_node_patch(list, &patch)?;
                }
                created[key] = value.clone();
            }
            let graph = graph_mut(doc)?;
            if graph.get(list).is_none() {
                graph[list] = json!([]);
            }
            graph[list]
                .as_array_mut()
                .ok_or_else(|| invalid("Graph node list must be an array"))?
                .push(created);
            graph["positions"][&new_id] = position;
        }
        GraphAction::PatchNode { id, patch } => {
            let (list, index) = utility_location(&doc["graph"], &id)
                .ok_or_else(|| target("Shared 2D graph node not found"))?;
            validate_node_patch(list, &patch)?;
            let node = doc["graph"][list][index].as_object_mut().unwrap();
            for (key, value) in patch {
                node.insert(key, value);
            }
        }
        GraphAction::RemoveNodes { ids } => {
            if ids.is_empty()
                || ids.len() > 256
                || ids.iter().collect::<HashSet<_>>().len() != ids.len()
            {
                return Err(target("Node IDs must be unique and nonempty"));
            }
            for id in &ids {
                if let Some(layer) = doc["layers"]
                    .as_array()
                    .unwrap()
                    .iter()
                    .find(|n| n["id"] == *id)
                {
                    if node_type(doc, id).is_none() {
                        return Err(err(
                            "UNSUPPORTED_CAPABILITY",
                            "Unsupported graph node is not editable",
                        ));
                    }
                    if layer["locked"] == true {
                        return Err(err("LOCKED_LAYER", "Unlock the layer before deleting it"));
                    }
                } else if utility_location(&doc["graph"], id).is_none() {
                    return Err(target("Shared 2D graph node not found"));
                }
            }
            let ids: HashSet<String> = ids.into_iter().collect();
            for edge in doc["graph"]["edges"]
                .as_array()
                .unwrap()
                .iter()
                .filter(|e| {
                    ids.contains(e["fromId"].as_str().unwrap_or(""))
                        || ids.contains(e["toId"].as_str().unwrap_or(""))
                })
            {
                validate_old_edge_editable(doc, edge)?;
            }
            doc["layers"]
                .as_array_mut()
                .unwrap()
                .retain(|n| !ids.contains(n["id"].as_str().unwrap_or("")));
            let graph = graph_mut(doc)?;
            for (_, list) in KINDS {
                if let Some(nodes) = graph[list].as_array_mut() {
                    nodes.retain(|n| !ids.contains(n["id"].as_str().unwrap_or("")));
                }
            }
            remove_node_references(graph, &ids);
        }
        GraphAction::DuplicateNodes { copies } => {
            if copies.is_empty() || copies.len() > 256 {
                return Err(target("Copies must be nonempty and bounded"));
            }
            let mut seen = HashSet::new();
            for copy in &copies {
                id(&Value::String(copy.new_id.clone()))?;
                if !seen.insert(&copy.new_id) || node_exists(doc, &copy.new_id) {
                    return Err(invalid("Duplicate graph node ID"));
                }
                if utility_location(&doc["graph"], &copy.id).is_none()
                    && !doc["layers"]
                        .as_array()
                        .unwrap()
                        .iter()
                        .any(|l| l["id"] == copy.id && node_type(doc, &copy.id).is_some())
                {
                    return Err(target("Shared 2D graph node not found"));
                }
            }
            for copy in copies {
                if let Some((list, index)) = utility_location(&doc["graph"], &copy.id) {
                    let mut node = doc["graph"][list][index].clone();
                    node["id"] = json!(copy.new_id);
                    doc["graph"][list].as_array_mut().unwrap().push(node);
                } else {
                    let layers = doc["layers"].as_array_mut().unwrap();
                    let index = layers.iter().position(|l| l["id"] == copy.id).unwrap();
                    let mut layer = layers[index].clone();
                    layer["id"] = json!(copy.new_id);
                    if let Some(name) = layer["name"].as_str() {
                        layer["name"] = json!(format!("{name} copy"));
                    }
                    layers.insert(index + 1, layer);
                }
                let pos = doc["graph"]["positions"]
                    .get(&copy.id)
                    .cloned()
                    .unwrap_or(json!({"x":0,"y":0}));
                doc["graph"]["positions"][&copy.new_id] = json!({"x":pos["x"].as_f64().unwrap_or(0.0)+40.0,"y":pos["y"].as_f64().unwrap_or(0.0)+40.0});
            }
        }
        GraphAction::SetPositions { positions } => {
            if positions.is_empty() || positions.len() > 256 {
                return Err(target("Positions must be nonempty and bounded"));
            }
            for (id, pos) in &positions {
                if node_type(doc, id).is_none() || !valid_position(pos) {
                    return Err(invalid("Invalid graph node position"));
                }
            }
            for (id, pos) in positions {
                doc["graph"]["positions"][&id] = pos;
            }
        }
        GraphAction::AddEdge { edge } => insert_edge(doc, edge)?,
        GraphAction::RemoveEdges { ids } => {
            if ids.is_empty()
                || ids.len() > 256
                || ids.iter().collect::<HashSet<_>>().len() != ids.len()
            {
                return Err(target("Edge IDs must be unique and nonempty"));
            }
            let edges = doc["graph"]["edges"].as_array().unwrap();
            if ids.iter().any(|id| !edges.iter().any(|e| e["id"] == *id)) {
                return Err(target("Graph edge not found"));
            }
            for edge in edges.iter().filter(|e| ids.iter().any(|id| e["id"] == *id)) {
                validate_old_edge_editable(doc, edge)?;
            }
            let edges = doc["graph"]["edges"].as_array_mut().unwrap();
            edges.retain(|e| !ids.iter().any(|id| e["id"] == *id));
        }
        GraphAction::ReconnectEdge {
            id,
            from_id,
            to_id,
            to_port,
        } => {
            let old = doc["graph"]["edges"]
                .as_array()
                .unwrap()
                .iter()
                .find(|e| e["id"] == id)
                .ok_or_else(|| target("Graph edge not found"))?;
            validate_old_edge_editable(doc, old)?;
            if old["fromId"] == from_id && old["toId"] == to_id && old["toPort"] == to_port {
                return Ok(());
            }
            let edges = doc["graph"]["edges"].as_array_mut().unwrap();
            let index = edges
                .iter()
                .position(|e| e["id"] == id)
                .ok_or_else(|| target("Graph edge not found"))?;
            let mut edge = edges.remove(index);
            edge["fromId"] = json!(from_id);
            edge["toId"] = json!(to_id);
            edge["toPort"] = json!(to_port);
            insert_edge(doc, edge)?;
        }
        GraphAction::SplitEdge {
            id,
            node_id,
            input_port,
        } => {
            if !node_exists(doc, &node_id) || node_id == OUTPUT_ID {
                return Err(target("Inserted graph node not found"));
            }
            let old = doc["graph"]["edges"]
                .as_array()
                .unwrap()
                .iter()
                .find(|e| e["id"] == id)
                .ok_or_else(|| target("Graph edge not found"))?;
            validate_old_edge_editable(doc, old)?;
            let edges = doc["graph"]["edges"].as_array_mut().unwrap();
            let index = edges
                .iter()
                .position(|e| e["id"] == id)
                .ok_or_else(|| target("Graph edge not found"))?;
            let edge = edges.remove(index);
            let before = json!({"id":format!("{id}__before"),"fromId":edge["fromId"],"fromPort":edge["fromPort"],"toId":node_id,"toPort":input_port});
            let after = json!({"id":format!("{id}__after"),"fromId":node_id,"fromPort":"out","toId":edge["toId"],"toPort":edge["toPort"]});
            insert_edge(doc, before)?;
            insert_edge(doc, after)?;
        }
        GraphAction::AddArea { mut area } => {
            validate_area(&area, doc)?;
            area["nodeIds"] = Value::Array(unique_ids(area["nodeIds"].as_array().unwrap()));
            if doc["graph"]["areas"]
                .as_array()
                .is_some_and(|a| a.iter().any(|v| v["id"] == area["id"]))
            {
                return Err(invalid("Duplicate graph area ID"));
            }
            if doc["graph"].get("areas").is_none() {
                doc["graph"]["areas"] = json!([]);
            }
            let ids: Vec<String> = area["nodeIds"]
                .as_array()
                .unwrap()
                .iter()
                .filter_map(|v| v.as_str().map(str::to_owned))
                .collect();
            assign_area_nodes(&mut doc["graph"], area["id"].as_str().unwrap(), &ids);
            doc["graph"]["areas"]
                .as_array_mut()
                .ok_or_else(|| invalid("Graph areas must be an array"))?
                .push(area);
        }
        GraphAction::PatchArea { id, patch } => {
            let patch_node_ids = patch.contains_key("nodeIds");
            if patch
                .keys()
                .any(|k| !matches!(k.as_str(), "name" | "color" | "collapsed" | "nodeIds"))
            {
                return Err(invalid("Invalid graph area field"));
            }
            let index = doc["graph"]["areas"]
                .as_array()
                .and_then(|a| a.iter().position(|v| v["id"] == id))
                .ok_or_else(|| target("Graph area not found"))?;
            let mut candidate = doc["graph"]["areas"][index].clone();
            for (k, v) in patch {
                candidate[&k] = v;
            }
            validate_area(&candidate, doc)?;
            if patch_node_ids {
                candidate["nodeIds"] =
                    Value::Array(unique_ids(candidate["nodeIds"].as_array().unwrap()));
                let ids: Vec<String> = candidate["nodeIds"]
                    .as_array()
                    .unwrap()
                    .iter()
                    .filter_map(|v| v.as_str().map(str::to_owned))
                    .collect();
                assign_area_nodes(&mut doc["graph"], &id, &ids);
            }
            let index = doc["graph"]["areas"]
                .as_array()
                .unwrap()
                .iter()
                .position(|v| v["id"] == id)
                .unwrap();
            doc["graph"]["areas"][index] = candidate;
        }
        GraphAction::RemoveArea { id } => {
            let areas = doc["graph"]["areas"]
                .as_array_mut()
                .ok_or_else(|| target("Graph area not found"))?;
            let index = areas
                .iter()
                .position(|v| v["id"] == id)
                .ok_or_else(|| target("Graph area not found"))?;
            areas.remove(index);
        }
        GraphAction::AssignArea { id, node_ids } => {
            let _index = doc["graph"]["areas"]
                .as_array()
                .and_then(|a| a.iter().position(|v| v["id"] == id))
                .ok_or_else(|| target("Graph area not found"))?;
            if node_ids
                .iter()
                .any(|n| n == OUTPUT_ID || node_type(doc, n).is_none())
            {
                return Err(target("Area node not found"));
            }
            let unique = unique_ids(&node_ids.into_iter().map(Value::String).collect::<Vec<_>>());
            assign_area_nodes(
                &mut doc["graph"],
                &id,
                &unique
                    .iter()
                    .filter_map(|v| v.as_str().map(str::to_owned))
                    .collect::<Vec<_>>(),
            );
            let index = doc["graph"]["areas"]
                .as_array()
                .unwrap()
                .iter()
                .position(|v| v["id"] == id)
                .unwrap();
            doc["graph"]["areas"][index]["nodeIds"] = json!(unique);
        }
    }
    let layers = doc["layers"].as_array().unwrap();
    validate_graph(layers, &doc["graph"])?;
    if cycle(doc["graph"]["edges"].as_array().unwrap()) {
        return Err(invalid("Graph contains a cycle"));
    }
    Ok(())
}

impl DocumentSession {
    pub(crate) fn graph_command(&mut self, action: GraphAction) -> Result<(), CommandError> {
        let before = &self.package["document"];
        // Only deletion of layer-backed nodes needs a cold structural candidate.
        // Pointer ticks clone graph metadata and small layer descriptors, never
        // image/font payloads carried by the package.
        let structural = matches!(
            action,
            GraphAction::RemoveNodes { .. } | GraphAction::DuplicateNodes { .. }
        );
        let mut candidate = if structural {
            before.clone()
        } else {
            json!({"layers":before["layers"].as_array().unwrap().iter().map(|l|
                json!({"id":l["id"],"kind":l["kind"],"locked":l["locked"]})).collect::<Vec<_>>(),
                "graph":before["graph"]})
        };
        apply(&mut candidate, action)?;
        if candidate["graph"] == before["graph"]
            && (!structural || candidate["layers"] == before["layers"])
        {
            return Ok(());
        }
        let next_size = self.serialized_len as i64
            + if structural {
                candidate.to_string().len() as i64 - before.to_string().len() as i64
            } else {
                candidate["graph"].to_string().len() as i64
                    - before["graph"].to_string().len() as i64
            };
        if next_size > MAX_PACKAGE_BYTES as i64 {
            return Err(err("PACKAGE_LIMIT", "Project would exceed 64 MiB"));
        }
        if structural && candidate["layers"] != before["layers"] {
            let edit = StructureEdit::between(
                before["layers"].as_array().unwrap(),
                candidate["layers"].as_array().unwrap(),
                before.get("graph"),
                candidate.get("graph"),
            );
            self.package["document"] = candidate;
            self.serialized_len = next_size as usize;
            self.record_edit(Edit {
                layer_index: 0,
                layer_id: None,
                fields: Vec::new(),
                structure: Some(edit),
                extended: None,
            });
            Ok(())
        } else {
            self.record_graph_change(candidate.get("graph").cloned())
        }
    }
    /// Immutable dependency snapshot for graph UI/render planning. The graph
    /// mode has a target path and disconnected metadata; stack mode is explicit.
    pub fn graph_plan_json(&self, target_id: &str) -> Result<String, crate::CoreError> {
        plan(&self.package["document"], target_id)
            .map(|v| v.to_string())
            .map_err(|_| crate::CoreError("Invalid graph target or topology"))
    }
}

pub fn plan(doc: &Value, target_id: &str) -> Result<Value, CommandError> {
    let layers = doc["layers"]
        .as_array()
        .ok_or_else(|| invalid("Layers are required"))?;
    if doc.get("graph").is_none_or(Value::is_null) {
        if target_id != OUTPUT_ID {
            return Err(target("Stack mode only has the export target"));
        }
        let ids: Vec<&str> = layers.iter().filter_map(|v| v["id"].as_str()).collect();
        let unsupported: Vec<&str> = ids
            .iter()
            .copied()
            .filter(|id| node_type(doc, id).is_none())
            .collect();
        return Ok(
            json!({"mode":"stack","targetId":OUTPUT_ID,"renderLayerIds":ids,"editorLayerOrderIds":ids,"dependencyNodeIds":ids,"dependencyEdgeIds":[],"dependencyEdges":[],"downstreamNodeIds":[OUTPUT_ID],"disconnectedNodeIds":[],"unsupportedNodeIds":unsupported,"renderable2d":unsupported.is_empty(),"connectedPorts":{"sources":[],"targets":[]},"layoutNodeIds":ids,"layoutPositions":{}}),
        );
    }
    let graph = &doc["graph"];
    validate_graph(layers, graph)?;
    let edges = graph["edges"].as_array().unwrap();
    if cycle(edges) {
        return Err(invalid("Graph contains a cycle"));
    }
    let mut all: Vec<String> = layers
        .iter()
        .filter_map(|v| v["id"].as_str().map(str::to_owned))
        .collect();
    all.extend(
        crate::command::graph_node_ids(graph)
            .into_iter()
            .map(str::to_owned),
    );
    all.push(OUTPUT_ID.into());
    if !all.iter().any(|id| id == target_id) {
        return Err(target("Graph target not found"));
    }
    // Edge-order DFS matches the existing Web helper's predecessor-first order.
    let mut seen = HashSet::new();
    let mut ordered = Vec::new();
    fn visit(id: &str, edges: &[Value], seen: &mut HashSet<String>, out: &mut Vec<String>) {
        if !seen.insert(id.to_owned()) {
            return;
        }
        for edge in edges {
            if edge["toId"] == id
                && let Some(from) = edge["fromId"].as_str()
            {
                visit(from, edges, seen, out);
            }
        }
        out.push(id.to_owned());
    }
    visit(target_id, edges, &mut seen, &mut ordered);
    let dependencies: Vec<String> = ordered
        .iter()
        .filter(|id| *id != OUTPUT_ID)
        .cloned()
        .collect();
    let render_layer_ids: Vec<String> = ordered
        .iter()
        .filter(|id| layers.iter().any(|l| l["id"] == **id))
        .cloned()
        .collect();
    let edge_ids: Vec<String> = edges
        .iter()
        .filter(|e| {
            seen.contains(e["fromId"].as_str().unwrap_or(""))
                && seen.contains(e["toId"].as_str().unwrap_or(""))
        })
        .filter_map(|e| e["id"].as_str().map(str::to_owned))
        .collect();
    let dependency_edges: Vec<Value> = edges
        .iter()
        .filter(|e| {
            seen.contains(e["fromId"].as_str().unwrap_or(""))
                && seen.contains(e["toId"].as_str().unwrap_or(""))
        })
        .cloned()
        .collect();
    let disconnected: Vec<String> = all
        .iter()
        .filter(|id| *id != OUTPUT_ID && !seen.contains(id.as_str()))
        .cloned()
        .collect();
    let mut downstream = HashSet::new();
    let mut downstream_queue = VecDeque::from([target_id.to_owned()]);
    let mut downstream_ids = Vec::new();
    while let Some(id) = downstream_queue.pop_front() {
        if !downstream.insert(id.clone()) {
            continue;
        }
        downstream_ids.push(id.clone());
        for edge in edges.iter().filter(|e| e["fromId"] == id) {
            if let Some(to) = edge["toId"].as_str() {
                downstream_queue.push_back(to.to_owned());
            }
        }
    }
    let mut editor_layer_order = render_layer_ids.clone();
    editor_layer_order.extend(
        layers
            .iter()
            .filter_map(|l| l["id"].as_str())
            .filter(|id| !seen.contains(*id))
            .map(str::to_owned),
    );
    let unsupported: Vec<String> = dependencies
        .iter()
        .filter(|id| node_type(doc, id).is_none())
        .cloned()
        .collect();
    let mut sources = BTreeSet::new();
    let mut targets = BTreeSet::new();
    for edge in edges {
        sources.insert(format!(
            "{}::{}",
            edge["fromId"].as_str().unwrap_or(""),
            edge["fromPort"].as_str().unwrap_or("")
        ));
        targets.insert(format!(
            "{}::{}",
            edge["toId"].as_str().unwrap_or(""),
            edge["toPort"].as_str().unwrap_or("")
        ));
    }
    // Stable Kahn depth/order inputs. Geometry remains a separate client choice.
    let mut indegree: BTreeMap<String, usize> = all.iter().map(|id| (id.clone(), 0)).collect();
    for e in edges {
        if let Some(id) = e["toId"].as_str() {
            *indegree.entry(id.to_owned()).or_default() += 1;
        }
    }
    let mut queue: VecDeque<String> = all
        .iter()
        .filter(|id| indegree.get(*id) == Some(&0))
        .cloned()
        .collect();
    let mut layout_order = Vec::new();
    let mut depth: BTreeMap<String, usize> = BTreeMap::new();
    while let Some(id) = queue.pop_front() {
        layout_order.push(id.clone());
        for e in edges.iter().filter(|e| e["fromId"] == id) {
            let to = e["toId"].as_str().unwrap().to_owned();
            let n = depth.get(&id).copied().unwrap_or(0) + 1;
            depth
                .entry(to.clone())
                .and_modify(|old| *old = (*old).max(n))
                .or_insert(n);
            let count = indegree.get_mut(&to).unwrap();
            *count -= 1;
            if *count == 0 {
                queue.push_back(to);
            }
        }
    }
    Ok(
        json!({"mode":"graph","targetId":target_id,"dependencyNodeIds":dependencies,"dependencyEdgeIds":edge_ids,"dependencyEdges":dependency_edges,"downstreamNodeIds":downstream_ids,"renderLayerIds":render_layer_ids,"editorLayerOrderIds":editor_layer_order,"disconnectedNodeIds":disconnected,"unsupportedNodeIds":unsupported,"renderable2d":unsupported.is_empty(),"connectedPorts":{"sources":sources,"targets":targets},"layoutNodeIds":layout_order,"layoutDepths":depth,"layoutPositions":graph["positions"]}),
    )
}
