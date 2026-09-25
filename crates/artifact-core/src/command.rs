//! Versioned document commands. The session owns the draft and the only history timeline.
use crate::{CoreError, DocumentSession, Edit, ExtendedEdit, FieldEdit, MAX_PACKAGE_BYTES};
use serde::{Deserialize, Serialize};
use serde_json::{Map, Value, json};
use std::collections::{BTreeMap, BTreeSet, HashSet};

pub const COMMAND_VERSION: u32 = 1;

#[derive(Debug, Clone, Deserialize)]
#[serde(tag = "type", rename_all = "snake_case")]
pub enum Command {
    PatchLayer {
        id: String,
        patch: Map<String, Value>,
    },
    PatchLayers {
        ids: Vec<String>,
        patch: Map<String, Value>,
    },
    PatchGlobal {
        patch: Map<String, Value>,
    },
    PatchExport {
        patch: Map<String, Value>,
    },
    AddLayer {
        kind: String,
        new_id: String,
        after_id: Option<String>,
        src: Option<Value>,
    },
    DuplicateLayer {
        id: String,
        new_id: String,
    },
    RemoveLayer {
        id: String,
    },
    MoveLayer {
        id: String,
        delta: i64,
    },
    Bridge {
        capability: String,
        target: BridgeTarget,
        #[serde(default)]
        value: Value,
        #[serde(default)]
        remove: bool,
    },
    BridgeStructure {
        capability: String,
        layers: Vec<Value>,
        graph: crate::structure_bridge::GraphCandidate,
    },
    EditAssets {
        collection: String,
        #[serde(default)]
        upsert: Vec<Value>,
        #[serde(default, rename = "removeIds")]
        remove_ids: Vec<String>,
        replace: Option<Vec<Value>>,
    },
    ReplaceDocument {
        document: Value,
    },
}

/// A Web-only operation must name the exact graph or unknown layer field it owns.
#[derive(Debug, Clone, PartialEq, Eq, Deserialize)]
#[serde(tag = "scope", rename_all = "snake_case")]
pub enum BridgeTarget {
    Graph,
    LayerField { id: String, field: String },
    ExportField { field: String },
}

pub(crate) struct Transaction {
    pub id: u64,
    pub draft_revision: u64,
    pub steps: Vec<Edit>,
}

#[derive(Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
struct BeginRequest {
    version: u32,
    expected_revision: u64,
}
#[derive(Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
struct UpdateRequest {
    version: u32,
    transaction_id: u64,
    commands: Vec<Command>,
}
#[derive(Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
struct EndRequest {
    version: u32,
    transaction_id: u64,
}

#[derive(Serialize, Default)]
#[serde(rename_all = "camelCase")]
struct Changes {
    layers: BTreeMap<String, BTreeSet<String>>,
    global: BTreeSet<String>,
    export: BTreeSet<String>,
    graph: bool,
    order: bool,
    assets: BTreeSet<String>,
    document: bool,
}
impl Changes {
    fn is_empty(&self) -> bool {
        self.layers.is_empty()
            && self.global.is_empty()
            && self.export.is_empty()
            && !self.graph
            && !self.order
            && self.assets.is_empty()
            && !self.document
    }
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
struct Reply {
    version: u32,
    ok: bool,
    revision: u64,
    draft_revision: u64,
    transaction_id: Option<u64>,
    changed: bool,
    changes: Changes,
    error: Option<CommandError>,
}

#[derive(Debug, Serialize)]
pub struct CommandError {
    pub code: &'static str,
    pub message: String,
}
impl CommandError {
    pub(crate) fn new(code: &'static str, message: impl Into<String>) -> Self {
        Self {
            code,
            message: message.into(),
        }
    }
}
fn reply(
    session: &DocumentSession,
    changed: bool,
    changes: Changes,
    error: Option<CommandError>,
) -> String {
    serde_json::to_string(&Reply {
        version: COMMAND_VERSION,
        ok: error.is_none(),
        revision: session.revision,
        draft_revision: session
            .transaction
            .as_ref()
            .map_or(0, |tx| tx.draft_revision),
        transaction_id: session.transaction.as_ref().map(|tx| tx.id),
        changed,
        changes,
        error,
    })
    .unwrap()
}
fn parse<T: for<'de> Deserialize<'de>>(request: &str) -> Result<T, CommandError> {
    if request.len() > 1024 * 1024 {
        return Err(CommandError::new(
            "INVALID_ENVELOPE",
            "Command envelope is too large",
        ));
    }
    serde_json::from_str(request)
        .map_err(|_| CommandError::new("INVALID_ENVELOPE", "Invalid command envelope"))
}
fn parse_update(request: &str) -> Result<UpdateRequest, CommandError> {
    if request.len() > MAX_PACKAGE_BYTES {
        return Err(CommandError::new(
            "INVALID_ENVELOPE",
            "Command envelope is too large",
        ));
    }
    let parsed: UpdateRequest = serde_json::from_str(request)
        .map_err(|_| CommandError::new("INVALID_ENVELOPE", "Invalid command envelope"))?;
    if parsed
        .commands
        .iter()
        .any(|command| matches!(command, Command::ReplaceDocument { .. }))
        && parsed.commands.len() != 1
    {
        return Err(CommandError::new(
            "INVALID_ENVELOPE",
            "Document replacement must be one cold command",
        ));
    }
    if request.len() > 1024 * 1024
        && (parsed.commands.len() != 1
            || !matches!(
                parsed.commands[0],
                Command::BridgeStructure { .. }
                    | Command::EditAssets { .. }
                    | Command::ReplaceDocument { .. }
            ))
    {
        return Err(CommandError::new(
            "INVALID_ENVELOPE",
            "Large envelope requires one cold structure, asset, or document command",
        ));
    }
    Ok(parsed)
}
fn version(version: u32) -> Result<(), CommandError> {
    if version == COMMAND_VERSION {
        Ok(())
    } else {
        Err(CommandError::new(
            "UNSUPPORTED_VERSION",
            "Unsupported command version",
        ))
    }
}
fn core_error(error: CoreError) -> CommandError {
    let code = match error.0 {
        "This graph contains nodes that are not editable on Mac yet" => "UNSUPPORTED_CAPABILITY",
        "Unlock the layer before deleting it" | "Unlock layers before reordering them" => {
            "LOCKED_LAYER"
        }
        "Project would exceed 64 MiB" => "PACKAGE_LIMIT",
        _ => "COMMAND_REJECTED",
    };
    CommandError::new(code, error.to_string())
}
fn apply_fields(object: &mut Map<String, Value>, fields: &[FieldEdit], forward: bool) {
    for field in fields {
        match if forward { &field.after } else { &field.before } {
            Some(value) => {
                object.insert(field.key.clone(), value.clone());
            }
            None => {
                object.remove(&field.key);
            }
        }
    }
}
fn value_growth(key: &str, before: &Option<Value>, after: &Option<Value>) -> i64 {
    let old = before.as_ref().map_or(0, |v| v.to_string().len()) as i64;
    let new = after.as_ref().map_or(0, |v| v.to_string().len()) as i64;
    let field = serde_json::to_string(key).unwrap().len() as i64 + 2;
    new - old
        + if before.is_none() && after.is_some() {
            field
        } else if before.is_some() && after.is_none() {
            -field
        } else {
            0
        }
}
fn asset_id(value: &Value) -> Option<&str> {
    value
        .as_object()?
        .get("id")?
        .as_str()
        .filter(|id| !id.is_empty() && id.len() <= 200 && !id.contains('\0'))
}
fn validate_asset_entries(entries: &[Value]) -> Result<(), CommandError> {
    let mut ids = HashSet::new();
    for entry in entries {
        let id = asset_id(entry)
            .ok_or_else(|| CommandError::new("INVALID_VALUE", "Asset entry needs a valid id"))?;
        if !ids.insert(id) {
            return Err(CommandError::new("INVALID_VALUE", "Duplicate asset id"));
        }
    }
    Ok(())
}
fn bridge_slot<'a>(
    doc: &'a mut Value,
    target: &BridgeTarget,
) -> Option<&'a mut Map<String, Value>> {
    match target {
        BridgeTarget::Graph => doc.as_object_mut(),
        BridgeTarget::LayerField { id, .. } => doc["layers"]
            .as_array_mut()?
            .iter_mut()
            .find(|layer| layer["id"] == *id)?
            .as_object_mut(),
        BridgeTarget::ExportField { .. } => doc["export"].as_object_mut(),
    }
}
fn bridge_key(target: &BridgeTarget) -> &str {
    match target {
        BridgeTarget::Graph => "graph",
        BridgeTarget::LayerField { field, .. } | BridgeTarget::ExportField { field } => field,
    }
}
pub(crate) fn apply_edit_to(doc: &mut Value, edit: &Edit, forward: bool) {
    if let Some(extended) = &edit.extended {
        match extended {
            ExtendedEdit::Group(steps) => {
                if forward {
                    for step in steps {
                        apply_edit_to(doc, step, true);
                    }
                } else {
                    for step in steps.iter().rev() {
                        apply_edit_to(doc, step, false);
                    }
                }
            }
            ExtendedEdit::RootFields(fields) => {
                apply_fields(doc.as_object_mut().expect("document"), fields, forward);
            }
            ExtendedEdit::Section { name, fields } => {
                apply_fields(
                    doc[*name].as_object_mut().expect("section"),
                    fields,
                    forward,
                );
            }
            ExtendedEdit::Bridge {
                target,
                before,
                after,
            } => {
                let value = if forward { after } else { before };
                let slot = bridge_slot(doc, target).expect("bridge target");
                match value {
                    Some(value) => {
                        slot.insert(bridge_key(target).to_owned(), value.clone());
                    }
                    None => {
                        slot.remove(bridge_key(target));
                    }
                }
            }
            ExtendedEdit::Reorder { before, after } => {
                let order = if forward { after } else { before };
                let layers = doc["layers"].as_array_mut().expect("layers");
                let mut by_id: BTreeMap<String, Value> = std::mem::take(layers)
                    .into_iter()
                    .map(|layer| (layer["id"].as_str().expect("id").to_owned(), layer))
                    .collect();
                *layers = order
                    .iter()
                    .map(|id| by_id.remove(id).expect("reorder layer"))
                    .collect();
            }
        }
    } else if let Some(structure) = &edit.structure {
        structure.apply(doc, forward);
    } else {
        let layers = doc["layers"].as_array_mut().expect("layers");
        let index = edit
            .layer_id
            .as_ref()
            .and_then(|id| layers.iter().position(|layer| layer["id"] == *id))
            .unwrap_or(edit.layer_index);
        apply_fields(
            layers[index].as_object_mut().expect("layer"),
            &edit.fields,
            forward,
        );
    }
}
fn net_changes(doc: &Value, steps: &[Edit]) -> Changes {
    if steps.is_empty() {
        return Changes::default();
    }
    let mut before = doc.clone();
    for step in steps.iter().rev() {
        apply_edit_to(&mut before, step, false);
    }
    diff_documents(&before, doc)
}
fn diff_documents(before: &Value, doc: &Value) -> Changes {
    let mut changes = Changes::default();
    let old_layers = before["layers"].as_array().unwrap();
    let new_layers = doc["layers"].as_array().unwrap();
    let old_ids: Vec<&str> = old_layers
        .iter()
        .filter_map(|layer| layer["id"].as_str())
        .collect();
    let new_ids: Vec<&str> = new_layers
        .iter()
        .filter_map(|layer| layer["id"].as_str())
        .collect();
    changes.order = old_ids != new_ids;
    changes.graph = before.get("graph") != doc.get("graph");
    for key in ["fontAssets", "modelAssets", "envAssets"] {
        if before.get(key) != doc.get(key) {
            changes.assets.insert(key.to_owned());
        }
    }
    for key in before
        .as_object()
        .unwrap()
        .keys()
        .chain(doc.as_object().unwrap().keys())
    {
        if !matches!(
            key.as_str(),
            "layers" | "global" | "export" | "graph" | "fontAssets" | "modelAssets" | "envAssets"
        ) && before.get(key) != doc.get(key)
        {
            changes.document = true;
        }
    }
    for id in old_ids
        .iter()
        .chain(&new_ids)
        .copied()
        .collect::<BTreeSet<_>>()
    {
        let old = old_layers.iter().find(|layer| layer["id"] == id);
        let new = new_layers.iter().find(|layer| layer["id"] == id);
        if old == new {
            continue;
        }
        let fields = changes.layers.entry(id.to_owned()).or_default();
        match (
            old.and_then(Value::as_object),
            new.and_then(Value::as_object),
        ) {
            (Some(a), Some(b)) => {
                for key in a.keys().chain(b.keys()).collect::<BTreeSet<_>>() {
                    if a.get(key) != b.get(key) {
                        fields.insert(key.clone());
                    }
                }
            }
            _ => {
                fields.insert("*".to_owned());
            }
        }
    }
    for (name, fields) in [
        ("global", &mut changes.global),
        ("export", &mut changes.export),
    ] {
        let old = before[name].as_object().unwrap();
        let new = doc[name].as_object().unwrap();
        for key in old.keys().chain(new.keys()).collect::<BTreeSet<_>>() {
            if old.get(key) != new.get(key) {
                fields.insert(key.clone());
            }
        }
    }
    changes
}
fn merge_fields(left: &mut Vec<FieldEdit>, right: Vec<FieldEdit>) {
    for field in right {
        if let Some(old) = left.iter_mut().find(|old| old.key == field.key) {
            old.after = field.after;
        } else {
            left.push(field);
        }
    }
}
fn property_step(edit: &Edit) -> bool {
    edit.structure.is_none()
        && matches!(
            edit.extended,
            None | Some(ExtendedEdit::Section { .. })
                | Some(ExtendedEdit::Bridge {
                    target: BridgeTarget::LayerField { .. } | BridgeTarget::ExportField { .. },
                    ..
                })
        )
}
fn same_property_target(a: &Edit, b: &Edit) -> bool {
    match (&a.extended, &b.extended) {
        (None, None) => a.layer_id.is_some() && a.layer_id == b.layer_id,
        (
            Some(ExtendedEdit::Section { name: a, .. }),
            Some(ExtendedEdit::Section { name: b, .. }),
        ) => a == b,
        (
            Some(ExtendedEdit::Bridge { target: a, .. }),
            Some(ExtendedEdit::Bridge { target: b, .. }),
        ) => a == b,
        _ => false,
    }
}
fn merge_property_target(previous: &mut Edit, next: &mut Edit) {
    match (&mut previous.extended, &mut next.extended) {
        (None, None) => merge_fields(&mut previous.fields, std::mem::take(&mut next.fields)),
        (
            Some(ExtendedEdit::Section { fields: a, .. }),
            Some(ExtendedEdit::Section { fields: b, .. }),
        ) => merge_fields(a, std::mem::take(b)),
        (
            Some(ExtendedEdit::Bridge { after: a, .. }),
            Some(ExtendedEdit::Bridge { after: b, .. }),
        ) => *a = b.take(),
        _ => unreachable!(),
    }
}
fn coalesce_steps(steps: &mut Vec<Edit>) {
    let mut compact: Vec<Edit> = Vec::with_capacity(steps.len());
    for mut step in std::mem::take(steps) {
        if property_step(&step) {
            let mut merged = false;
            for previous in compact.iter_mut().rev() {
                if !property_step(previous) {
                    break;
                }
                if same_property_target(previous, &step) {
                    merge_property_target(previous, &mut step);
                    merged = true;
                    break;
                }
            }
            if merged {
                continue;
            }
        } else if let Some(previous) = compact.last_mut() {
            match (&mut previous.extended, &mut step.extended) {
                (
                    Some(ExtendedEdit::Reorder { after, .. }),
                    Some(ExtendedEdit::Reorder { after: next, .. }),
                ) => {
                    *after = std::mem::take(next);
                    continue;
                }
                (
                    Some(ExtendedEdit::Bridge {
                        target: BridgeTarget::Graph,
                        after,
                        ..
                    }),
                    Some(ExtendedEdit::Bridge {
                        target: BridgeTarget::Graph,
                        after: next,
                        ..
                    }),
                ) => {
                    *after = next.take();
                    continue;
                }
                _ => {}
            }
        }
        compact.push(step);
    }
    *steps = compact;
}
fn net_changes_without_structure(doc: &Value, steps: &[Edit]) -> Option<Changes> {
    let mut first: BTreeMap<(String, String), Option<Value>> = BTreeMap::new();
    let mut first_order: Option<&[String]> = None;
    for step in steps {
        if let Some(ExtendedEdit::Section { name, fields }) = &step.extended {
            for field in fields {
                first
                    .entry(((*name).to_owned(), field.key.clone()))
                    .or_insert_with(|| field.before.clone());
            }
        } else if let Some(ExtendedEdit::Bridge { target, before, .. }) = &step.extended {
            let scope = match target {
                BridgeTarget::Graph => "document".to_owned(),
                BridgeTarget::LayerField { id, .. } => format!("layer:{id}"),
                BridgeTarget::ExportField { .. } => "export".to_owned(),
            };
            first
                .entry((scope, bridge_key(target).to_owned()))
                .or_insert_with(|| before.clone());
        } else if let Some(ExtendedEdit::Reorder { before, .. }) = &step.extended {
            first_order.get_or_insert(before);
        } else if let Some(id) = &step.layer_id {
            for field in &step.fields {
                first
                    .entry((format!("layer:{id}"), field.key.clone()))
                    .or_insert_with(|| field.before.clone());
            }
        } else {
            return None;
        }
    }
    let mut changes = Changes::default();
    for ((scope, key), before) in first {
        let after = if let Some(id) = scope.strip_prefix("layer:") {
            doc["layers"]
                .as_array()
                .and_then(|layers| layers.iter().find(|layer| layer["id"] == id))
                .and_then(|layer| layer.get(&key))
        } else if scope == "document" {
            doc.get(&key)
        } else {
            doc[&scope].get(&key)
        };
        if after != before.as_ref() {
            if let Some(id) = scope.strip_prefix("layer:") {
                changes.layers.entry(id.to_owned()).or_default().insert(key);
            } else if scope == "global" {
                changes.global.insert(key);
            } else if scope == "export" {
                changes.export.insert(key);
            } else {
                changes.graph = true;
            }
        }
    }
    if let Some(before) = first_order {
        changes.order = before.iter().map(String::as_str).collect::<Vec<_>>()
            != doc["layers"]
                .as_array()
                .unwrap()
                .iter()
                .filter_map(|layer| layer["id"].as_str())
                .collect::<Vec<_>>();
    }
    Some(changes)
}
impl DocumentSession {
    /// Graph-rule modules validate a candidate first, then journal it here.
    /// This keeps graph edits in the same transaction and undo owner.
    #[allow(dead_code)]
    pub(crate) fn record_graph_change(&mut self, after: Option<Value>) -> Result<(), CommandError> {
        let before = self.package["document"].get("graph").cloned();
        if before == after {
            return Ok(());
        }
        let next_size = self.serialized_len as i64 + value_growth("graph", &before, &after);
        if next_size > MAX_PACKAGE_BYTES as i64 {
            return Err(CommandError::new(
                "PACKAGE_LIMIT",
                "Project would exceed 64 MiB",
            ));
        }
        match &after {
            Some(graph) => {
                self.package["document"]["graph"] = graph.clone();
            }
            None => {
                self.package["document"]
                    .as_object_mut()
                    .unwrap()
                    .remove("graph");
            }
        }
        self.serialized_len = next_size as usize;
        self.record_edit(Edit {
            layer_index: 0,
            layer_id: None,
            fields: Vec::new(),
            structure: None,
            extended: Some(ExtendedEdit::Bridge {
                target: BridgeTarget::Graph,
                before,
                after,
            }),
        });
        Ok(())
    }
    /// Saving is explicit: export_json exposes the draft during an active transaction.
    /// Clients should save only after commit/cancel, or use this durable guard.
    pub fn export_durable_json(&self) -> Result<String, CoreError> {
        self.require_no_transaction()?;
        Ok(self.export_json())
    }
    pub fn revision(&self) -> u64 {
        self.revision
    }
    pub fn begin_transaction_json(&mut self, request: &str) -> String {
        let result = (|| {
            let request: BeginRequest = parse(request)?;
            version(request.version)?;
            if self.transaction.is_some() {
                return Err(CommandError::new(
                    "ACTIVE_TRANSACTION",
                    "Finish the active transaction first",
                ));
            }
            if request.expected_revision != self.revision {
                return Err(CommandError::new(
                    "REVISION_CONFLICT",
                    "Document revision has changed",
                ));
            }
            let id = self.next_transaction_id;
            self.next_transaction_id += 1;
            self.transaction = Some(Transaction {
                id,
                draft_revision: 0,
                steps: Vec::new(),
            });
            Ok(())
        })();
        reply(self, false, Changes::default(), result.err())
    }
    fn transaction_id(&self, id: u64) -> Result<(), CommandError> {
        match &self.transaction {
            Some(tx) if tx.id == id => Ok(()),
            _ => Err(CommandError::new(
                "STALE_TRANSACTION",
                "Transaction ID is no longer active",
            )),
        }
    }
    pub fn update_transaction_json(&mut self, request: &str) -> String {
        let result = (|| {
            let request: UpdateRequest = parse_update(request)?;
            version(request.version)?;
            self.transaction_id(request.transaction_id)?;
            if request.commands.len() > 128 {
                return Err(CommandError::new(
                    "INVALID_ENVELOPE",
                    "Too many commands in one update",
                ));
            }
            let start = self.transaction.as_ref().unwrap().steps.len();
            let prior_len = self.serialized_len;
            for command in request.commands {
                if let Err(error) = self.apply_command(command) {
                    let steps = self.transaction.as_mut().unwrap().steps.split_off(start);
                    for step in steps.iter().rev() {
                        self.apply_edit(step, false);
                    }
                    self.serialized_len = prior_len;
                    return Err(error);
                }
            }
            let steps = &self.transaction.as_ref().unwrap().steps[start..];
            let changes = net_changes_without_structure(&self.package["document"], steps)
                .unwrap_or_else(|| net_changes(&self.package["document"], steps));
            if changes.is_empty() {
                let steps = self.transaction.as_mut().unwrap().steps.split_off(start);
                for step in steps.iter().rev() {
                    self.apply_edit(step, false);
                }
                self.serialized_len = prior_len;
                return Ok((false, Changes::default()));
            }
            let retained = self
                .transaction
                .as_ref()
                .unwrap()
                .steps
                .iter()
                .map(Edit::retained_bytes)
                .sum::<usize>();
            let history_limit = if self
                .transaction
                .as_ref()
                .unwrap()
                .steps
                .iter()
                .any(|step| matches!(step.extended, Some(ExtendedEdit::RootFields(_))))
            {
                MAX_PACKAGE_BYTES * 2
            } else {
                MAX_PACKAGE_BYTES
            };
            if retained > history_limit {
                // Near the budget, test compaction on a journal copy before
                // mutating the rollback source. Normal gesture ticks never clone.
                let mut candidate = self.transaction.as_ref().unwrap().steps.clone();
                coalesce_steps(&mut candidate);
                if candidate.iter().map(Edit::retained_bytes).sum::<usize>() <= history_limit {
                    self.transaction.as_mut().unwrap().steps = candidate;
                    self.transaction.as_mut().unwrap().draft_revision += 1;
                    return Ok((true, changes));
                }
                let steps = self.transaction.as_mut().unwrap().steps.split_off(start);
                for step in steps.iter().rev() {
                    self.apply_edit(step, false);
                }
                self.serialized_len = prior_len;
                return Err(CommandError::new(
                    "HISTORY_LIMIT",
                    "Transaction history exceeds the cold document budget",
                ));
            }
            self.transaction.as_mut().unwrap().draft_revision += 1;
            coalesce_steps(&mut self.transaction.as_mut().unwrap().steps);
            Ok((true, changes))
        })();
        match result {
            Ok((changed, changes)) => reply(self, changed, changes, None),
            Err(error) => reply(self, false, Changes::default(), Some(error)),
        }
    }
    pub fn commit_transaction_json(&mut self, request: &str) -> String {
        let result = (|| {
            let request: EndRequest = parse(request)?;
            version(request.version)?;
            self.transaction_id(request.transaction_id)?;
            let tx = self.transaction.take().unwrap();
            let changes = net_changes(&self.package["document"], &tx.steps);
            if changes.is_empty() {
                for step in tx.steps.iter().rev() {
                    self.apply_edit(step, false);
                }
                self.serialized_len = self.package.to_string().len();
                return Ok((false, Changes::default()));
            }
            self.record_edit(Edit {
                layer_index: 0,
                layer_id: None,
                fields: Vec::new(),
                structure: None,
                extended: Some(ExtendedEdit::Group(tx.steps)),
            });
            Ok((true, changes))
        })();
        match result {
            Ok((changed, changes)) => reply(self, changed, changes, None),
            Err(error) => reply(self, false, Changes::default(), Some(error)),
        }
    }
    pub fn cancel_transaction_json(&mut self, request: &str) -> String {
        let result = (|| {
            let request: EndRequest = parse(request)?;
            version(request.version)?;
            self.transaction_id(request.transaction_id)?;
            let tx = self.transaction.take().unwrap();
            let changes = net_changes(&self.package["document"], &tx.steps);
            let changed = !changes.is_empty();
            for step in tx.steps.iter().rev() {
                self.apply_edit(step, false);
            }
            self.serialized_len = self.package.to_string().len();
            Ok((changed, changes))
        })();
        match result {
            Ok((changed, changes)) => reply(self, changed, changes, None),
            Err(error) => reply(self, false, Changes::default(), Some(error)),
        }
    }
    fn apply_command(&mut self, command: Command) -> Result<(), CommandError> {
        match command {
            Command::PatchLayer { id, patch } => {
                self.edit_layer(&id, &Value::Object(patch))
                    .map_err(core_error)?;
            }
            Command::PatchLayers { ids, patch } => {
                if ids.is_empty()
                    || ids.len() > 256
                    || ids.iter().collect::<HashSet<_>>().len() != ids.len()
                {
                    return Err(CommandError::new(
                        "INVALID_TARGET",
                        "Layer IDs must be unique and nonempty",
                    ));
                }
                for id in ids {
                    self.edit_layer(&id, &Value::Object(patch.clone()))
                        .map_err(core_error)?;
                }
            }
            Command::PatchGlobal { patch } => self.patch_section("global", patch)?,
            Command::PatchExport { patch } => self.patch_section("export", patch)?,
            Command::AddLayer {
                kind,
                new_id,
                after_id,
                src,
            } => {
                self.execute_impl(&json!({"type":"add_layer","kind":kind,"newId":new_id,"afterId":after_id,"src":src}).to_string()).map_err(core_error)?;
            }
            Command::DuplicateLayer { id, new_id } => {
                self.execute_impl(
                    &json!({"type":"duplicate_layer","id":id,"newId":new_id}).to_string(),
                )
                .map_err(core_error)?;
            }
            Command::RemoveLayer { id } => {
                self.execute_impl(&json!({"type":"delete_layer","id":id}).to_string())
                    .map_err(core_error)?;
            }
            Command::MoveLayer { id, delta } => self.move_layer(&id, delta)?,
            Command::Bridge {
                capability,
                target,
                value,
                remove,
            } => self.bridge(capability, target, value, remove)?,
            Command::BridgeStructure {
                capability,
                layers,
                graph,
            } => {
                self.bridge_structure(&capability, layers, graph)?;
            }
            Command::EditAssets {
                collection,
                upsert,
                remove_ids,
                replace,
            } => {
                self.edit_assets(&collection, upsert, remove_ids, replace)?;
            }
            Command::ReplaceDocument { document } => self.replace_document(document)?,
        }
        Ok(())
    }
    fn record_root_fields(&mut self, fields: Vec<FieldEdit>) -> Result<(), CommandError> {
        if fields.is_empty() {
            return Ok(());
        }
        let growth: i64 = fields
            .iter()
            .map(|field| value_growth(&field.key, &field.before, &field.after))
            .sum();
        let next_size = self.serialized_len as i64 + growth;
        if next_size > MAX_PACKAGE_BYTES as i64 {
            return Err(CommandError::new(
                "PACKAGE_LIMIT",
                "Project would exceed 64 MiB",
            ));
        }
        apply_fields(
            self.package["document"].as_object_mut().unwrap(),
            &fields,
            true,
        );
        self.serialized_len = next_size as usize;
        self.record_edit(Edit {
            layer_index: 0,
            layer_id: None,
            fields: Vec::new(),
            structure: None,
            extended: Some(ExtendedEdit::RootFields(fields)),
        });
        Ok(())
    }

    fn edit_assets(
        &mut self,
        collection: &str,
        upsert: Vec<Value>,
        remove_ids: Vec<String>,
        replace: Option<Vec<Value>>,
    ) -> Result<(), CommandError> {
        if !matches!(collection, "fontAssets" | "modelAssets" | "envAssets") {
            return Err(CommandError::new(
                "INVALID_TARGET",
                "Unknown asset collection",
            ));
        }
        if replace.is_some() && (!upsert.is_empty() || !remove_ids.is_empty()) {
            return Err(CommandError::new(
                "INVALID_ENVELOPE",
                "Replace cannot be combined with upsert or removeIds",
            ));
        }
        let before = self.package["document"].get(collection).cloned();
        let existing = match &before {
            Some(value) => value
                .as_array()
                .ok_or_else(|| {
                    CommandError::new("INVALID_VALUE", "Asset collection must be an array")
                })?
                .clone(),
            None => Vec::new(),
        };
        let is_replace = replace.is_some();
        let mut entries = if let Some(entries) = replace {
            entries
        } else {
            existing.clone()
        };
        validate_asset_entries(&entries)?;
        let mut removed = HashSet::new();
        for id in &remove_ids {
            if id.is_empty() || !removed.insert(id) {
                return Err(CommandError::new(
                    "INVALID_TARGET",
                    "removeIds must be unique nonempty ids",
                ));
            }
        }
        entries.retain(|entry| !removed.contains(&entry["id"].as_str().unwrap().to_owned()));
        let mut upsert_seen = HashSet::new();
        for entry in upsert {
            let id = asset_id(&entry)
                .ok_or_else(|| CommandError::new("INVALID_VALUE", "Asset entry needs a valid id"))?
                .to_owned();
            if !upsert_seen.insert(id.clone()) || removed.contains(&id) {
                return Err(CommandError::new(
                    "INVALID_TARGET",
                    "Asset id is repeated across operations",
                ));
            }
            if let Some(index) = entries.iter().position(|old| old["id"] == id) {
                for (key, value) in entry.as_object().unwrap() {
                    entries[index][key] = value.clone();
                }
            } else {
                entries.push(entry);
            }
        }
        let after = Value::Array(entries);
        if before.as_ref() == Some(&after)
            || (before.is_none() && !is_replace && after == Value::Array(existing))
        {
            return Ok(());
        }
        self.record_root_fields(vec![FieldEdit {
            key: collection.to_owned(),
            before,
            after: Some(after),
        }])
    }

    fn replace_document(&mut self, document: Value) -> Result<(), CommandError> {
        if !document.is_object() {
            return Err(CommandError::new(
                "INVALID_VALUE",
                "Document must be an object",
            ));
        }
        let mut candidate = self.package.clone();
        candidate["document"] = document.clone();
        let source = candidate.to_string();
        if source.len() > MAX_PACKAGE_BYTES {
            return Err(CommandError::new(
                "PACKAGE_LIMIT",
                "Project would exceed 64 MiB",
            ));
        }
        let checked = DocumentSession::open(&source)
            .map_err(|error| CommandError::new("INVALID_VALUE", error.to_string()))?;
        for collection in ["fontAssets", "modelAssets", "envAssets"] {
            if let Some(value) = document.get(collection) {
                let entries = value.as_array().ok_or_else(|| {
                    CommandError::new("INVALID_VALUE", "Asset collection must be an array")
                })?;
                validate_asset_entries(entries)?;
            }
        }
        if let Some(graph) = document.get("graph").filter(|graph| !graph.is_null()) {
            if !graph.is_object() {
                return Err(CommandError::new(
                    "INVALID_VALUE",
                    "Graph must be an object or null",
                ));
            }
            validate_graph(document["layers"].as_array().unwrap(), graph)?;
        }
        let old = self.package["document"].as_object().unwrap();
        let new = checked.package["document"].as_object().unwrap();
        let fields = old
            .keys()
            .chain(new.keys())
            .collect::<BTreeSet<_>>()
            .into_iter()
            .filter(|key| old.get(*key) != new.get(*key))
            .map(|key| FieldEdit {
                key: key.clone(),
                before: old.get(key).cloned(),
                after: new.get(key).cloned(),
            })
            .collect();
        self.record_root_fields(fields)
    }
    fn patch_section(
        &mut self,
        name: &'static str,
        patch: Map<String, Value>,
    ) -> Result<(), CommandError> {
        let section = self.package["document"][name].as_object().unwrap();
        let mut fields = Vec::new();
        for (key, value) in patch {
            let valid = match (name, key.as_str()) {
                ("global", "aspect") => ["1:1", "4:5", "9:16", "16:9"].iter().any(|s| value == *s),
                ("global", "bg") => {
                    value == "transparent"
                        || value.as_str().is_some_and(|s| {
                            s.len() == 7
                                && s.starts_with('#')
                                && s[1..].bytes().all(|b| b.is_ascii_hexdigit())
                        })
                }
                ("global", "seed") => value.as_u64().is_some_and(|n| n <= u32::MAX as u64),
                ("export", "format") => value == "png" || value == "jpeg",
                ("export", "scale") => value.as_u64().is_some_and(|n| (1..=3).contains(&n)),
                ("export", "target") => value == "cover", // envmap is outside local 2D parity
                _ => false,
            };
            if !valid {
                return Err(CommandError::new(
                    "UNSUPPORTED_CAPABILITY",
                    format!("Unsupported {name}.{key} value"),
                ));
            }
            let before = section.get(&key).cloned();
            if before.as_ref() != Some(&value) {
                fields.push(FieldEdit {
                    key,
                    before,
                    after: Some(value),
                });
            }
        }
        if fields.is_empty() {
            return Ok(());
        }
        let growth: i64 = fields
            .iter()
            .map(|field| {
                field.after.as_ref().unwrap().to_string().len() as i64
                    - field.before.as_ref().map_or(0, |v| v.to_string().len()) as i64
                    + if field.before.is_none() {
                        serde_json::to_string(&field.key).unwrap().len() as i64 + 2
                    } else {
                        0
                    }
            })
            .sum();
        if self.serialized_len as i64 + growth > MAX_PACKAGE_BYTES as i64 {
            return Err(CommandError::new(
                "PACKAGE_LIMIT",
                "Project would exceed 64 MiB",
            ));
        }
        apply_fields(
            self.package["document"][name].as_object_mut().unwrap(),
            &fields,
            true,
        );
        self.serialized_len = (self.serialized_len as i64 + growth) as usize;
        self.record_edit(Edit {
            layer_index: 0,
            layer_id: None,
            fields: Vec::new(),
            structure: None,
            extended: Some(ExtendedEdit::Section { name, fields }),
        });
        Ok(())
    }
    fn move_layer(&mut self, id: &str, delta: i64) -> Result<(), CommandError> {
        if delta != -1 && delta != 1 {
            return Err(CommandError::new(
                "INVALID_VALUE",
                "Move delta must be -1 or 1",
            ));
        }
        let layers = self.package["document"]["layers"].as_array_mut().unwrap();
        let index = layers
            .iter()
            .position(|layer| layer["id"] == id)
            .ok_or_else(|| CommandError::new("INVALID_TARGET", "Layer not found"))?;
        let next = index as i64 + delta;
        if next < 0 || next >= layers.len() as i64 {
            return Ok(());
        }
        let next = next as usize;
        if layers[index]["locked"] == true || layers[next]["locked"] == true {
            return Err(CommandError::new(
                "LOCKED_LAYER",
                "Unlock layers before reordering them",
            ));
        }
        let before: Vec<String> = layers
            .iter()
            .map(|layer| layer["id"].as_str().unwrap().to_owned())
            .collect();
        layers.swap(index, next);
        let after: Vec<String> = layers
            .iter()
            .map(|layer| layer["id"].as_str().unwrap().to_owned())
            .collect();
        self.record_edit(Edit {
            layer_index: 0,
            layer_id: None,
            fields: Vec::new(),
            structure: None,
            extended: Some(ExtendedEdit::Reorder { before, after }),
        });
        Ok(())
    }
    fn bridge(
        &mut self,
        capability: String,
        target: BridgeTarget,
        value: Value,
        remove: bool,
    ) -> Result<(), CommandError> {
        match &target {
            BridgeTarget::Graph => {
                if capability != "web:graph" {
                    return Err(CommandError::new(
                        "UNSUPPORTED_CAPABILITY",
                        "Graph bridge requires web:graph",
                    ));
                }
                if !remove && !value.is_object() {
                    return Err(CommandError::new(
                        "INVALID_VALUE",
                        "Graph must be an object",
                    ));
                }
                if !remove {
                    validate_graph(
                        self.package["document"]["layers"].as_array().unwrap(),
                        &value,
                    )?;
                }
            }
            BridgeTarget::LayerField { id, field } => {
                if capability != "web:layer-property" {
                    return Err(CommandError::new(
                        "UNSUPPORTED_CAPABILITY",
                        "Layer bridge requires web:layer-property",
                    ));
                }
                if id.is_empty()
                    || field.is_empty()
                    || field == "id"
                    || field == "kind"
                    || field.len() > 200
                    || field.contains('/')
                {
                    return Err(CommandError::new(
                        "INVALID_TARGET",
                        "Invalid layer field target",
                    ));
                }
                let layer = self.package["document"]["layers"]
                    .as_array()
                    .unwrap()
                    .iter()
                    .find(|layer| layer["id"] == *id)
                    .ok_or_else(|| CommandError::new("INVALID_TARGET", "Layer not found"))?;
                if crate::properties::is_shared_key(
                    &self.package["document"],
                    layer["kind"].as_str().unwrap(),
                    field,
                ) {
                    return Err(CommandError::new(
                        "UNSUPPORTED_CAPABILITY",
                        "Use a typed patch for shared properties",
                    ));
                }
            }
            BridgeTarget::ExportField { field } => {
                if capability != "web:export-envmap" {
                    return Err(CommandError::new(
                        "UNSUPPORTED_CAPABILITY",
                        "Export bridge requires web:export-envmap",
                    ));
                }
                if field != "target" || remove || value != "envmap" {
                    return Err(CommandError::new(
                        "UNSUPPORTED_CAPABILITY",
                        "Only Web envmap export target is bridged",
                    ));
                }
            }
        }
        let key = bridge_key(&target).to_owned();
        let slot = bridge_slot(&mut self.package["document"], &target).unwrap();
        let before = slot.get(&key).cloned();
        let after = if remove { None } else { Some(value) };
        if before == after {
            return Ok(());
        }
        let next_size = self.serialized_len as i64 + value_growth(&key, &before, &after);
        if next_size > MAX_PACKAGE_BYTES as i64 {
            return Err(CommandError::new(
                "PACKAGE_LIMIT",
                "Project would exceed 64 MiB",
            ));
        }
        match &after {
            Some(v) => {
                slot.insert(key, v.clone());
            }
            None => {
                slot.remove(&key);
            }
        }
        self.serialized_len = next_size as usize;
        self.record_edit(Edit {
            layer_index: 0,
            layer_id: None,
            fields: Vec::new(),
            structure: None,
            extended: Some(ExtendedEdit::Bridge {
                target,
                before,
                after,
            }),
        });
        Ok(())
    }
}

pub(crate) fn validate_graph(layers: &[Value], graph: &Value) -> Result<(), CommandError> {
    let edges = graph["edges"]
        .as_array()
        .ok_or_else(|| CommandError::new("INVALID_VALUE", "Graph edges must be an array"))?;
    let mut ids: HashSet<&str> = layers
        .iter()
        .filter_map(|layer| layer["id"].as_str())
        .collect();
    for list in crate::editor::GRAPH_LISTS {
        if let Some(value) = graph.get(*list) {
            let nodes = value.as_array().ok_or_else(|| {
                CommandError::new("INVALID_VALUE", "Graph node list must be an array")
            })?;
            for node in nodes {
                let id = node["id"]
                    .as_str()
                    .filter(|id| !id.is_empty() && id.len() <= 200 && *id != "__export__")
                    .ok_or_else(|| CommandError::new("INVALID_VALUE", "Graph node needs an id"))?;
                if !ids.insert(id) {
                    return Err(CommandError::new(
                        "INVALID_VALUE",
                        "Duplicate graph node id",
                    ));
                }
            }
        }
    }
    let mut edge_ids = HashSet::new();
    for edge in edges {
        let id = edge["id"]
            .as_str()
            .filter(|id| !id.is_empty() && id.len() <= 200 && !id.contains('\0'))
            .ok_or_else(|| CommandError::new("INVALID_VALUE", "Edge needs an id"))?;
        let from = edge["fromId"]
            .as_str()
            .ok_or_else(|| CommandError::new("INVALID_VALUE", "Edge needs a source"))?;
        let to = edge["toId"]
            .as_str()
            .ok_or_else(|| CommandError::new("INVALID_VALUE", "Edge needs a target"))?;
        if !edge_ids.insert(id) || !ids.contains(from) || !(ids.contains(to) || to == "__export__")
        {
            return Err(CommandError::new(
                "INVALID_VALUE",
                "Invalid graph edge endpoint or duplicate id",
            ));
        }
    }
    Ok(())
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn repeated_pointer_edits_keep_one_small_inverse() {
        let source = json!({"artifactPackage":"project","manifest":{"kind":"artifact-project-package","version":1,"documentSchemaVersion":3},
            "document":{"schemaVersion":3,"global":{"aspect":"1:1","bg":"transparent","seed":1},
                "layers":[{"id":"a","kind":"text","content":"A","x":0.5}],"export":{"format":"png","scale":1,"target":"cover"}}}).to_string();
        let mut session = DocumentSession::open(&source).unwrap();
        session.begin_transaction_json(r#"{"version":1,"expectedRevision":0}"#);
        let payload = "x".repeat(128 * 1024);
        for n in 0..550 {
            let result = session.update_transaction_json(&json!({"version":1,"transactionId":1,"commands":[
                {"type":"bridge","capability":"web:layer-property","target":{"scope":"layer_field","id":"a","field":"webGesture"},
                "value":format!("{n}{payload}")}] }).to_string());
            assert_eq!(
                serde_json::from_str::<Value>(&result).unwrap()["ok"],
                true,
                "{result}"
            );
        }
        let tx = session.transaction.as_ref().unwrap();
        assert_eq!(tx.steps.len(), 1);
        assert!(tx.steps[0].retained_bytes() < 256 * 1024);
    }

    #[test]
    fn alternating_multi_layer_ticks_keep_two_small_inverses() {
        let source = json!({"artifactPackage":"project","manifest":{"kind":"artifact-project-package","version":1,"documentSchemaVersion":3},
            "document":{"schemaVersion":3,"global":{"aspect":"1:1","bg":"transparent","seed":1},
                "layers":[{"id":"a","kind":"text","content":"A","x":0.5},{"id":"b","kind":"text","content":"B","x":0.5}],
                "export":{"format":"png","scale":1,"target":"cover"}}}).to_string();
        let mut session = DocumentSession::open(&source).unwrap();
        session.begin_transaction_json(r#"{"version":1,"expectedRevision":0}"#);
        for n in 0..5000 {
            let result = session.update_transaction_json(
                &json!({"version":1,"transactionId":1,"commands":[
                {"type":"patch_layers","ids":["a","b"],"patch":{"x":0.5 + n as f64 / 10000.0}}]})
                .to_string(),
            );
            assert_eq!(
                serde_json::from_str::<Value>(&result).unwrap()["ok"],
                true,
                "{result}"
            );
        }
        let tx = session.transaction.as_ref().unwrap();
        assert_eq!(tx.steps.len(), 2);
        assert!(tx.steps.iter().map(Edit::retained_bytes).sum::<usize>() < 1024);
        assert_eq!(
            serde_json::from_str::<Value>(
                &session.commit_transaction_json(r#"{"version":1,"transactionId":1}"#)
            )
            .unwrap()["changed"],
            true
        );
        assert!(session.undo());
        assert_eq!(session.export_json(), source);
    }

    #[test]
    fn adjacent_graph_bridge_ticks_coalesce() {
        let source = json!({"artifactPackage":"project","manifest":{"kind":"artifact-project-package","version":1,"documentSchemaVersion":3},
            "document":{"schemaVersion":3,"global":{},"layers":[{"id":"a","kind":"text"}],"export":{}}}).to_string();
        let mut session = DocumentSession::open(&source).unwrap();
        session.begin_transaction_json(r#"{"version":1,"expectedRevision":0}"#);
        for n in 0..50 {
            let result = session.update_transaction_json(
                &json!({"version":1,"transactionId":1,"commands":[{
                    "type":"bridge","capability":"web:graph","target":{"scope":"graph"},
                    "value":{"edges":[],"positions":{},"mergeNodes":[],"colorNodes":[],"unknown":n}
                }]})
                .to_string(),
            );
            assert_eq!(
                serde_json::from_str::<Value>(&result).unwrap()["ok"],
                true,
                "{result}"
            );
        }
        assert_eq!(session.transaction.as_ref().unwrap().steps.len(), 1);
        assert_eq!(
            serde_json::from_str::<Value>(
                &session.commit_transaction_json(r#"{"version":1,"transactionId":1}"#)
            )
            .unwrap()["changed"],
            true
        );
        assert!(session.undo());
        assert_eq!(session.export_json(), source);
    }
}
