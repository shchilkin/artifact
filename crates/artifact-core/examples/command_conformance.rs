use artifact_core::DocumentSession;
use serde_json::{Value, json};

fn main() -> Result<(), Box<dyn std::error::Error>> {
    let args: Vec<String> = std::env::args().collect();
    if args.len() != 4 {
        return Err("usage: command_conformance INPUT COMMANDS OUTPUT".into());
    }
    let source = std::fs::read_to_string(&args[1])?;
    let commands: Value = serde_json::from_str(&std::fs::read_to_string(&args[2])?)?;
    let mut session = DocumentSession::open(&source)?;
    let opened = session.export_json();
    let begin =
        session.begin_transaction_json(&json!({"version":1,"expectedRevision":0}).to_string());
    let original_aspect = serde_json::from_str::<Value>(&source)?["document"]["global"]["aspect"]
        .as_str()
        .ok_or("fixture needs aspect")?
        .to_owned();
    let alternate_aspect = if original_aspect == "1:1" {
        "4:5"
    } else {
        "1:1"
    };
    let noop_update = session.update_transaction_json(
        &json!({"version":1,"transactionId":1,"commands":[
            {"type":"patch_global","patch":{"aspect":alternate_aspect}},
            {"type":"patch_global","patch":{"aspect":original_aspect}}
        ]})
        .to_string(),
    );
    let update = session.update_transaction_json(
        &json!({"version":1,"transactionId":1,"commands":commands}).to_string(),
    );
    let draft = session.export_json();
    let commit =
        session.commit_transaction_json(&json!({"version":1,"transactionId":1}).to_string());
    let committed = session.export_json();
    assert!(session.undo());
    let undone = session.export_json();
    assert!(session.redo());
    let redone = session.export_json();
    let graph_plan = session.graph_plan_json("__export__")?;
    let reopened = DocumentSession::open(&session.export_durable_json()?)?.export_json();
    let stale =
        session.cancel_transaction_json(&json!({"version":1,"transactionId":1}).to_string());
    let first = commands[0]["id"]
        .as_str()
        .ok_or("first command needs layer id")?;
    let seed = serde_json::from_str::<Value>(&source)?["document"]["global"]["seed"]
        .as_u64()
        .ok_or("fixture needs seed")?;
    let cancel_begin = session.begin_transaction_json(
        &json!({"version":1,"expectedRevision":session.revision()}).to_string(),
    );
    let cancel_update = session.update_transaction_json(
        &json!({"version":1,"transactionId":2,"commands":[
            {"type":"patch_global","patch":{"seed":seed+2}}
        ]})
        .to_string(),
    );
    let cancel_draft = session.export_json();
    let failed = session.update_transaction_json(&json!({"version":1,"transactionId":2,"commands":[
        {"type":"bridge","capability":"web:layer-property","target":{"scope":"layer_field","id":first,"field":"cancelledNull"},"value":null},
        {"type":"patch_global","patch":{"aspect":"invalid"}}
    ]}).to_string());
    let failed_draft = session.export_json();
    let cancel =
        session.cancel_transaction_json(&json!({"version":1,"transactionId":2}).to_string());
    let cancelled = session.export_json();
    assert!(session.execute(
        &json!({"type":"edit_layer","id":first,"patch":{"name":"P03 legacy"}}).to_string()
    )?);
    let legacy = session.export_json();
    let mixed_begin = session.begin_transaction_json(
        &json!({"version":1,"expectedRevision":session.revision()}).to_string(),
    );
    let mixed_update = session.update_transaction_json(
        &json!({"version":1,"transactionId":3,"commands":[
            {"type":"patch_global","patch":{"seed":seed+3}}
        ]})
        .to_string(),
    );
    let mixed_commit =
        session.commit_transaction_json(&json!({"version":1,"transactionId":3}).to_string());
    let mixed_after = session.export_json();
    assert!(session.undo());
    let mixed_undo_transaction = session.export_json();
    assert!(session.undo());
    let mixed_undo_legacy = session.export_json();
    assert!(session.redo());
    let mixed_redo_legacy = session.export_json();
    assert!(session.redo());
    let mixed_redo_transaction = session.export_json();
    let mut structure_update = String::new();
    let mut structure_commit = String::new();
    let mut structure_undo = String::new();
    let mut structure_redo = String::new();
    if serde_json::from_str::<Value>(&source)?["document"]["coldStructureConformance"] == true {
        let current: Value = serde_json::from_str(&session.export_json())?;
        let mut layers = current["document"]["layers"].as_array().unwrap().clone();
        layers.push(json!({"id":"p03-model","kind":"model","unknown":{"nested":null}}));
        let bridge = json!({"type":"bridge_structure","capability":"web:structure","layers":layers,
            "graph":{"present":true,"value":{"edges":[{"id":"p03-edge","fromId":"p03-model","toId":"__export__"}],
            "positions":{},"mergeNodes":[],"colorNodes":[],"unknown":{"nested":null}}}});
        session.begin_transaction_json(
            &json!({"version":1,"expectedRevision":session.revision()}).to_string(),
        );
        structure_update = session.update_transaction_json(
            &json!({"version":1,"transactionId":4,"commands":[bridge]}).to_string(),
        );
        structure_commit =
            session.commit_transaction_json(&json!({"version":1,"transactionId":4}).to_string());
        assert!(session.undo());
        structure_undo = session.export_json();
        assert!(session.redo());
        structure_redo = session.export_json();
    }
    let output = json!({"opened":opened,"begin":begin,"noopUpdate":noop_update,"update":update,"draft":draft,"commit":commit,
        "committed":committed,"undone":undone,"redone":redone,"reopened":reopened,"stale":stale,
        "cancelBegin":cancel_begin,"cancelUpdate":cancel_update,"cancelDraft":cancel_draft,"failed":failed,"failedDraft":failed_draft,
        "cancel":cancel,"cancelled":cancelled,"legacy":legacy,"mixedBegin":mixed_begin,"mixedUpdate":mixed_update,
        "mixedCommit":mixed_commit,"mixedAfter":mixed_after,"mixedUndoTransaction":mixed_undo_transaction,
        "mixedUndoLegacy":mixed_undo_legacy,"mixedRedoLegacy":mixed_redo_legacy,"mixedRedoTransaction":mixed_redo_transaction,
        "structureUpdate":structure_update,"structureCommit":structure_commit,"structureUndo":structure_undo,"structureRedo":structure_redo,
        "graphPlan":graph_plan});
    std::fs::write(&args[3], output.to_string())?;
    Ok(())
}
