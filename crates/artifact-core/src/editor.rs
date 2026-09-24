//! Shared layer/graph mutations. Platform UIs submit commands, never rebuild edges.
use crate::{CoreError, DocumentSession, Edit, FieldEdit, MAX_PACKAGE_BYTES};
use serde_json::{Value, json};
use std::collections::{HashMap, HashSet};

pub(crate) const GRAPH_LISTS: &[&str] = &[
    "mergeNodes",
    "colorNodes",
    "repeatNodes",
    "maskNodes",
    "transformNodes",
    "grimeShadowNodes",
    "materialNodes",
    "scene3dNodes",
    "environmentNodes",
    "shaderNodes",
];

#[derive(Clone)]
pub(crate) struct StructureEdit {
    before_order: Vec<String>,
    after_order: Vec<String>,
    // Only inserted/deleted/replaced layers, not copies of every image payload.
    changes: Vec<(String, Option<Value>, Option<Value>)>,
    before_graph: Option<Value>,
    after_graph: Option<Value>,
}
impl StructureEdit {
    pub(crate) fn between(
        before_layers: &[Value],
        after_layers: &[Value],
        before_graph: Option<&Value>,
        after_graph: Option<&Value>,
    ) -> Self {
        let before_order = ids(before_layers);
        let after_order = ids(after_layers);
        let all: HashSet<String> = before_order.iter().chain(&after_order).cloned().collect();
        let changes = all
            .into_iter()
            .filter_map(|id| {
                let before = before_layers.iter().find(|layer| layer["id"] == id);
                let after = after_layers.iter().find(|layer| layer["id"] == id);
                (before != after).then(|| (id, before.cloned(), after.cloned()))
            })
            .collect();
        Self {
            before_order,
            after_order,
            changes,
            before_graph: before_graph.cloned(),
            after_graph: after_graph.cloned(),
        }
    }
    pub(crate) fn bytes(&self) -> usize {
        self.changes
            .iter()
            .map(|(_, a, b)| {
                a.as_ref().map_or(0, |v| v.to_string().len())
                    + b.as_ref().map_or(0, |v| v.to_string().len())
            })
            .sum::<usize>()
            + self
                .before_graph
                .as_ref()
                .map_or(0, |v| v.to_string().len())
            + self.after_graph.as_ref().map_or(0, |v| v.to_string().len())
    }
    pub(crate) fn apply(&self, document: &mut Value, forward: bool) {
        let mut layers: HashMap<String, Value> = document["layers"]
            .as_array()
            .unwrap()
            .iter()
            .map(|v| (v["id"].as_str().unwrap().to_owned(), v.clone()))
            .collect();
        for (id, before, after) in &self.changes {
            let target = if forward { after } else { before };
            if let Some(layer) = target {
                layers.insert(id.clone(), layer.clone());
            } else {
                layers.remove(id);
            }
        }
        let order = if forward {
            &self.after_order
        } else {
            &self.before_order
        };
        document["layers"] = Value::Array(
            order
                .iter()
                .map(|id| layers.remove(id).expect("history layer"))
                .collect(),
        );
        let graph = if forward {
            &self.after_graph
        } else {
            &self.before_graph
        };
        if let Some(graph) = graph {
            document["graph"] = graph.clone();
        } else {
            document.as_object_mut().unwrap().remove("graph");
        }
    }
}
fn ids(layers: &[Value]) -> Vec<String> {
    layers
        .iter()
        .map(|v| v["id"].as_str().unwrap().to_owned())
        .collect()
}
fn id<'a>(command: &'a Value, key: &str) -> Result<&'a str, CoreError> {
    command[key]
        .as_str()
        .filter(|s| !s.is_empty() && s.len() <= 200)
        .ok_or(CoreError("Missing or invalid id"))
}
fn input_port(layers: &[Value], to: &str) -> &'static str {
    if to == "__export__"
        || layers
            .iter()
            .any(|l| l["id"] == to && l["kind"] == "effect")
    {
        "in"
    } else {
        "bg"
    }
}
fn edge(layers: &[Value], from: &str, to: &str) -> Value {
    json!({"id":format!("e-{from}-{to}"),"fromId":from,"fromPort":"out","toId":to,"toPort":input_port(layers,to)})
}
fn chain_edges(layers: &[Value], order: &[String]) -> Vec<Value> {
    order
        .iter()
        .enumerate()
        .map(|(i, from)| {
            edge(
                layers,
                from,
                order.get(i + 1).map_or("__export__", String::as_str),
            )
        })
        .collect()
}
fn basic_graph(doc: &Value) -> Result<(), CoreError> {
    let graph = &doc["graph"];
    if graph.is_null() {
        return Ok(());
    }
    if GRAPH_LISTS
        .iter()
        .any(|key| graph[key].as_array().is_some_and(|v| !v.is_empty()))
    {
        return Err(CoreError(
            "This graph contains nodes that are not editable on Mac yet",
        ));
    }
    let layers = doc["layers"].as_array().unwrap();
    let layer_ids = ids(layers);
    let mut parents = HashMap::new();
    let mut edge_ids = HashSet::new();
    for e in graph["edges"]
        .as_array()
        .ok_or(CoreError("Missing graph edges"))?
    {
        let from = id(e, "fromId")?;
        let to = id(e, "toId")?;
        if !layer_ids.iter().any(|s| s == from)
            || !(to == "__export__" || layer_ids.iter().any(|s| s == to))
            || e["fromPort"] != "out"
            || e["toPort"] != input_port(layers, to)
        {
            return Err(CoreError("Invalid graph node or port"));
        }
        if !edge_ids.insert(id(e, "id")?) || parents.insert(to, from).is_some() {
            return Err(CoreError("Each input accepts one connection"));
        }
    }
    for start in parents.keys() {
        let mut seen = HashSet::new();
        let mut current = *start;
        while let Some(parent) = parents.get(current) {
            if !seen.insert(current) {
                return Err(CoreError("Connection would create a cycle"));
            }
            current = parent;
        }
    }
    Ok(())
}
fn output_order(doc: &Value) -> Vec<String> {
    let layers = doc["layers"].as_array().unwrap();
    if doc["graph"].is_null() {
        return ids(layers);
    }
    let Some(edges) = doc["graph"]["edges"].as_array() else {
        return Vec::new();
    };
    let mut result = Vec::new();
    let mut current = "__export__";
    let mut seen = HashSet::new();
    while seen.insert(current) {
        let Some(e) = edges.iter().find(|e| e["toId"] == current) else {
            break;
        };
        let Some(from) = e["fromId"].as_str() else {
            break;
        };
        result.push(from.to_owned());
        current = from;
    }
    result.reverse();
    result
}
fn linear_order(doc: &Value) -> Result<Vec<String>, CoreError> {
    basic_graph(doc)?;
    let order = output_order(doc);
    if order.len() != doc["layers"].as_array().unwrap().len()
        || (!doc["graph"].is_null()
            && doc["graph"]["edges"].as_array().unwrap().len() != order.len())
    {
        return Err(CoreError(
            "Reorder is available for a single chain; edit connections in Nodes",
        ));
    }
    Ok(order)
}
fn ensure_graph(doc: &mut Value) {
    if doc["graph"].is_null() {
        let layers = doc["layers"].as_array().unwrap();
        doc["graph"] = json!({"edges":chain_edges(layers,&ids(layers)),"positions":{},"mergeNodes":[],"colorNodes":[]});
    }
}
fn number(v: &Value, low: f64, high: f64) -> bool {
    v.as_f64()
        .is_some_and(|n| n.is_finite() && (low..=high).contains(&n))
}

impl DocumentSession {
    /// Stateless adapter for an existing Web document owner. Assets and graph
    /// stay outside this call; the same property validation backs NativeSession.
    pub fn patch_layer_json(layer_json: &str, patch_json: &str) -> Result<String, CoreError> {
        if layer_json.len() + patch_json.len() > MAX_PACKAGE_BYTES {
            return Err(CoreError("Layer edit is too large"));
        }
        let layer: Value =
            serde_json::from_str(layer_json).map_err(|_| CoreError("Invalid layer JSON"))?;
        let target = layer["id"]
            .as_str()
            .ok_or(CoreError("Missing layer id"))?
            .to_owned();
        let mut package: Value = serde_json::from_str(&Self::blank_json()).unwrap();
        package["document"]["layers"] = json!([layer]);
        let mut session = Self::open(&package.to_string())?;
        let patch: Value =
            serde_json::from_str(patch_json).map_err(|_| CoreError("Invalid patch JSON"))?;
        session.edit_layer(&target, &patch)?;
        Ok(session.package["document"]["layers"][0].to_string())
    }

    pub fn blank_json() -> String {
        json!({"artifactPackage":"project","manifest":{"kind":"artifact-project-package","version":1,"documentSchemaVersion":3},
            "document":{"schemaVersion":3,"global":{"aspect":"1:1","seed":4242,"bg":"transparent"},"export":{"format":"png","scale":3},"layers":[],"fontAssets":[]}}).to_string()
    }
    pub fn editor_state_json(&self) -> String {
        let doc = &self.package["document"];
        let layers = doc["layers"].as_array().unwrap();
        let properties: Vec<Value> = layers
            .iter()
            .map(|l| {
                let keys = [
                    "id",
                    "name",
                    "kind",
                    "visible",
                    "locked",
                    "opacity",
                    "x",
                    "y",
                    "scaleX",
                    "scaleY",
                    "rotation",
                    "content",
                    "size",
                    "color",
                    "font",
                    "align",
                    "fit",
                    "emojis",
                    "density",
                    "minSz",
                    "maxSz",
                    "seedOffset",
                    "glitch",
                    "grain",
                    "noiseWarp",
                    "vortex",
                    "tearAmt",
                    "tearSize",
                    "scanlines",
                    "scanlineWidth",
                    "ca",
                ];
                let mut result: serde_json::Map<String, Value> = keys
                    .iter()
                    .filter_map(|key| l.get(*key).map(|v| ((*key).to_owned(), v.clone())))
                    .collect();
                if let Some((width, height)) = crate::image::dimensions(l) {
                    result.insert("sourceWidth".into(), json!(width));
                    result.insert("sourceHeight".into(), json!(height));
                }
                Value::Object(result)
            })
            .collect();
        let mut graph = doc.clone();
        ensure_graph(&mut graph);
        let fonts:Vec<Value>=doc["fontAssets"].as_array().into_iter().flatten().filter_map(|f|f["id"].as_str().map(|id|json!({"id":format!("artifact-font://{id}"),"name":f["label"].as_str().unwrap_or("Embedded font")}))).collect();
        json!({"layers":properties,"graph":graph["graph"],"order":output_order(doc),"canReorder":linear_order(doc).is_ok(),"graphEditable":basic_graph(doc).is_ok(),"fonts":fonts}).to_string()
    }
    pub fn execute(&mut self, command_json: &str) -> Result<bool, CoreError> {
        self.require_no_transaction()?;
        self.execute_impl(command_json)
    }
    pub(crate) fn execute_impl(&mut self, command_json: &str) -> Result<bool, CoreError> {
        if command_json.len() > 24 * 1024 * 1024 {
            return Err(CoreError("Command is too large"));
        }
        let c: Value =
            serde_json::from_str(command_json).map_err(|_| CoreError("Invalid command JSON"))?;
        let op = id(&c, "type")?;
        if op == "edit_layer" {
            return self.edit_layer(id(&c, "id")?, &c["patch"]);
        }
        let before = &self.package["document"];
        basic_graph(before)?;
        let mut doc = before.clone();
        match op {
            "add_layer" | "duplicate_layer" => {
                let new_id = id(&c, "newId")?;
                if new_id == "__export__"
                    || doc["layers"]
                        .as_array()
                        .unwrap()
                        .iter()
                        .any(|l| l["id"] == new_id)
                {
                    return Err(CoreError("Layer id already exists"));
                }
                if doc["layers"].as_array().unwrap().len() >= 256 {
                    return Err(CoreError("This editor supports up to 256 layers"));
                }
                let after = c["afterId"].as_str();
                let mut layer = if op == "duplicate_layer" {
                    let existing = doc["layers"]
                        .as_array()
                        .unwrap()
                        .iter()
                        .find(|l| l["id"] == id(&c, "id").unwrap_or(""))
                        .ok_or(CoreError("Layer not found"))?;
                    let mut copy = existing.clone();
                    copy["name"] = json!(format!(
                        "{} copy",
                        existing["name"].as_str().unwrap_or("Layer")
                    ));
                    copy["locked"] = json!(false);
                    copy
                } else {
                    let kind = id(&c, "kind")?;
                    let mut l = json!({"kind":kind,"name":kind,"visible":true,"locked":false,"opacity":100,"blendMode":"normal"});
                    match kind {
                        "fill"=>{l["color"]=json!("#171512");}
                        "text"=>{
                            let font=doc["layers"].as_array().unwrap().iter().find(|l|l["kind"]=="text").and_then(|l|l["font"].as_str()).unwrap_or("MONO");
                            for(k,v)in json!({"content":"TITLE","font":font,"size":74,"color":"#ffffff","x":0.5,"y":0.5,"scaleX":1,"scaleY":1,"rotation":0,"align":"center"}).as_object().unwrap(){l[k]=v.clone();}
                        }
                        "image"=>{
                            crate::image::validate_source(&c["src"])?;
                            for(k,v)in json!({"src":c["src"],"fit":"contain","x":0.5,"y":0.5,"scaleX":1,"scaleY":1,"rotation":0}).as_object().unwrap(){l[k]=v.clone();}
                        }
                        "emoji"=>{for(k,v)in json!({"emojis":["✦"],"density":30,"minSz":24,"maxSz":72,"blur":0,"seedOffset":0}).as_object().unwrap(){l[k]=v.clone();}}
                        "effect"=>{l["scanlines"]=json!(20);l["scanlineWidth"]=json!(4);l["tearSize"]=json!(4);}
                        _=>return Err(CoreError("Unsupported layer kind")),
                    }
                    l
                };
                layer["id"] = json!(new_id);
                let chain = linear_order(&doc).ok();
                let previous = if op == "duplicate_layer" {
                    Some(id(&c, "id")?)
                } else {
                    after
                };
                if let Some(previous) = previous
                    && !doc["layers"]
                        .as_array()
                        .unwrap()
                        .iter()
                        .any(|l| l["id"] == previous)
                {
                    return Err(CoreError("Insertion layer not found"));
                }
                let index = previous
                    .and_then(|p| {
                        doc["layers"]
                            .as_array()
                            .unwrap()
                            .iter()
                            .position(|l| l["id"] == p)
                    })
                    .map_or(doc["layers"].as_array().unwrap().len(), |i| i + 1);
                doc["layers"].as_array_mut().unwrap().insert(index, layer);
                if let Some(mut order) = chain {
                    let index = previous
                        .and_then(|p| order.iter().position(|s| s == p))
                        .map_or(order.len(), |i| i + 1);
                    order.insert(index, new_id.to_owned());
                    if !doc["graph"].is_null() {
                        doc["graph"]["edges"] =
                            json!(chain_edges(doc["layers"].as_array().unwrap(), &order));
                    }
                } // Nonlinear graphs get a disconnected node; never silently rewire branches.
                if !doc["graph"].is_null() {
                    let p = previous.and_then(|p| doc["graph"]["positions"].get(p));
                    let x = p.and_then(|v| v["x"].as_f64()).unwrap_or(0.0) + 260.0;
                    let y = p.and_then(|v| v["y"].as_f64()).unwrap_or(0.0) + 40.0;
                    if !doc["graph"]["positions"].is_object() {
                        doc["graph"]["positions"] = json!({});
                    }
                    doc["graph"]["positions"][new_id] = json!({"x":x,"y":y});
                }
            }
            "delete_layer" => {
                let target = id(&c, "id")?;
                let layers = doc["layers"].as_array().unwrap();
                let found = layers
                    .iter()
                    .find(|l| l["id"] == target)
                    .ok_or(CoreError("Layer not found"))?;
                if found["locked"] == true {
                    return Err(CoreError("Unlock the layer before deleting it"));
                }
                if !doc["graph"].is_null() {
                    let edges = doc["graph"]["edges"].as_array().unwrap();
                    let parent = edges
                        .iter()
                        .find(|e| e["toId"] == target)
                        .and_then(|e| e["fromId"].as_str());
                    let mut next: Vec<Value> = edges
                        .iter()
                        .filter(|e| e["toId"] != target && e["fromId"] != target)
                        .cloned()
                        .collect();
                    if let Some(parent) = parent {
                        for e in edges.iter().filter(|e| e["fromId"] == target) {
                            next.push(edge(layers, parent, e["toId"].as_str().unwrap()));
                        }
                    }
                    doc["graph"]["edges"] = json!(next);
                    if let Some(p) = doc["graph"]["positions"].as_object_mut() {
                        p.remove(target);
                    }
                    if let Some(areas) = doc["graph"]["areas"].as_array_mut() {
                        for area in areas {
                            if let Some(nodes) = area["nodeIds"].as_array_mut() {
                                nodes.retain(|v| v != target);
                            }
                        }
                    }
                }
                doc["layers"]
                    .as_array_mut()
                    .unwrap()
                    .retain(|l| l["id"] != target);
            }
            "move_layer" => {
                let target = id(&c, "id")?;
                let mut order = linear_order(&doc)?;
                let index = order
                    .iter()
                    .position(|s| s == target)
                    .ok_or(CoreError("Layer not found"))?;
                let delta = c["delta"]
                    .as_i64()
                    .filter(|n| *n == 1 || *n == -1)
                    .ok_or(CoreError("Invalid move direction"))?;
                let next = index as i64 + delta;
                if next < 0 || next >= order.len() as i64 {
                    return Ok(false);
                }
                let layers = doc["layers"].as_array().unwrap();
                if layers.iter().any(|l| {
                    (l["id"] == target || l["id"] == order[next as usize]) && l["locked"] == true
                }) {
                    return Err(CoreError("Unlock layers before reordering them"));
                }
                order.swap(index, next as usize);
                let reordered: Vec<Value> = order
                    .iter()
                    .map(|id| layers.iter().find(|l| l["id"] == *id).unwrap().clone())
                    .collect();
                if !doc["graph"].is_null() {
                    doc["graph"]["edges"] = json!(chain_edges(&reordered, &order));
                }
                doc["layers"] = json!(reordered);
            }
            "connect" => {
                ensure_graph(&mut doc);
                let from = id(&c, "from")?;
                let to = id(&c, "to")?;
                let e = edge(doc["layers"].as_array().unwrap(), from, to);
                let edges = doc["graph"]["edges"].as_array_mut().unwrap();
                if edges.iter().any(|e| e["fromId"] == from && e["toId"] == to) {
                    return Ok(false);
                }
                edges.retain(|e| e["toId"] != to);
                edges.push(e);
            }
            "disconnect" => {
                ensure_graph(&mut doc);
                let target = id(&c, "to")?;
                doc["graph"]["edges"]
                    .as_array_mut()
                    .unwrap()
                    .retain(|e| e["toId"] != target);
            }
            "move_node" => {
                let target = id(&c, "id")?;
                if target != "__export__"
                    && !doc["layers"]
                        .as_array()
                        .unwrap()
                        .iter()
                        .any(|l| l["id"] == target)
                {
                    return Err(CoreError("Node not found"));
                }
                if !number(&c["x"], -100000.0, 100000.0) || !number(&c["y"], -100000.0, 100000.0) {
                    return Err(CoreError("Invalid node position"));
                }
                ensure_graph(&mut doc);
                if !doc["graph"]["positions"].is_object() {
                    doc["graph"]["positions"] = json!({});
                }
                doc["graph"]["positions"][target] = json!({"x":c["x"],"y":c["y"]});
            }
            _ => return Err(CoreError("Unknown editor command")),
        }
        basic_graph(&doc)?;
        if &doc == before {
            return Ok(false);
        }
        if self.serialized_len - before.to_string().len() + doc.to_string().len()
            > MAX_PACKAGE_BYTES
        {
            return Err(CoreError("Project would exceed 64 MiB"));
        }
        let old = before["layers"].as_array().unwrap();
        let new = doc["layers"].as_array().unwrap();
        let all: HashSet<String> = ids(old).into_iter().chain(ids(new)).collect();
        let changes = all
            .into_iter()
            .filter_map(|id| {
                let a = old.iter().find(|l| l["id"] == id);
                let b = new.iter().find(|l| l["id"] == id);
                (a != b).then(|| (id, a.cloned(), b.cloned()))
            })
            .collect();
        let change = StructureEdit {
            before_order: ids(old),
            after_order: ids(new),
            changes,
            before_graph: before.get("graph").cloned(),
            after_graph: doc.get("graph").cloned(),
        };
        self.package["document"] = doc;
        self.serialized_len = self.package.to_string().len();
        self.record_edit(Edit {
            layer_index: 0,
            layer_id: None,
            fields: Vec::new(),
            structure: Some(change),
            extended: None,
        });
        Ok(true)
    }
    pub(crate) fn edit_layer(&mut self, target: &str, patch: &Value) -> Result<bool, CoreError> {
        let patch = patch
            .as_object()
            .ok_or(CoreError("Layer patch must be an object"))?;
        let layers = self.package["document"]["layers"].as_array().unwrap();
        let index = layers
            .iter()
            .position(|l| l["id"] == target)
            .ok_or(CoreError("Layer not found"))?;
        let layer = &layers[index];
        let kind = layer["kind"].as_str().unwrap();
        let mut fields = Vec::new();
        for (key, value) in patch {
            let valid = crate::properties::validate(&self.package["document"], kind, key, value);
            if !valid {
                return Err(CoreError(
                    "Unsupported property or value outside its allowed range",
                ));
            }
            let before = layer.get(key).cloned();
            if before.as_ref() == Some(value)
                || (value.is_number() && before.as_ref().and_then(Value::as_f64) == value.as_f64())
            {
                continue;
            }
            fields.push(FieldEdit {
                key: key.clone(),
                before,
                after: Some(value.clone()),
            });
        }
        if kind == "emoji" {
            let min = patch
                .get("minSz")
                .unwrap_or(&layer["minSz"])
                .as_f64()
                .unwrap_or(24.0);
            let max = patch
                .get("maxSz")
                .unwrap_or(&layer["maxSz"])
                .as_f64()
                .unwrap_or(72.0);
            if min > max {
                return Err(CoreError("Minimum emoji size cannot exceed maximum size"));
            }
        }
        if fields.is_empty() {
            return Ok(false);
        }
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
            return Err(CoreError("Project would exceed 64 MiB"));
        }
        self.commit(index, fields);
        Ok(true)
    }
    pub fn draft_plan_json(
        &self,
        layer_id: &str,
        patch_json: &str,
        size: u32,
    ) -> Result<String, CoreError> {
        if !(1..=3000).contains(&size) {
            return Err(CoreError("Render dimensions must be 1–3000 pixels"));
        }
        let mut draft = Self {
            package: self.package.clone(),
            past: Vec::new(),
            future: Vec::new(),
            revision: 0,
            next_transaction_id: 1,
            transaction: None,
            serialized_len: self.serialized_len,
        };
        let patch: Value =
            serde_json::from_str(patch_json).map_err(|_| CoreError("Invalid transform draft"))?;
        if !patch.as_object().is_some_and(|p| {
            p.keys()
                .all(|key| ["x", "y", "scaleX", "scaleY", "rotation"].contains(&key.as_str()))
        }) {
            return Err(CoreError("Invalid transform draft"));
        }
        draft.edit_layer(layer_id, &patch)?;
        let aspect = draft.package["document"]["global"]["aspect"]
            .as_str()
            .unwrap_or("1:1");
        let (width, height) = match aspect {
            "4:5" => ((size * 4 + 2) / 5, size),
            "9:16" => ((size * 9 + 8) / 16, size),
            "16:9" => (size, (size * 9 + 8) / 16),
            _ => (size, size),
        };
        draft.render_plan_json(width, height)
    }
}
