use artifact_core::DocumentSession;
use serde_json::{Value, json};
fn run(s: &mut DocumentSession, c: Value) -> bool {
    s.execute(&c.to_string()).unwrap()
}
fn source() -> String {
    json!({"artifactPackage":"project","manifest":{"kind":"artifact-project-package","version":1,"documentSchemaVersion":3},"document":{"schemaVersion":3,"global":{"aspect":"1:1","bg":"transparent"},"export":{},"layers":[{"id":"b","kind":"effect","scanlines":10,"name":"B"},{"id":"a","kind":"fill","color":"#ffffff","name":"A","extra":"preserve"}],"graph":{"edges":[{"id":"ab","fromId":"a","toId":"b","fromPort":"out","toPort":"in"},{"id":"bo","fromId":"b","toId":"__export__","fromPort":"out","toPort":"in"}],"positions":{"a":{"x":-32,"y":21}},"areas":[{"nodeIds":["a","b"],"name":"Keep"}],"custom":"keep"}}}).to_string()
}
#[test]
fn coherent_layer_workflow_undo_restores_every_package_byte() {
    let original = source();
    let mut s = DocumentSession::open(&original).unwrap();
    let mut states = vec![original.clone()];
    for command in [
        json!({"type":"edit_layer","id":"a","patch":{"name":"Background","opacity":60}}),
        json!({"type":"move_layer","id":"a","delta":1}),
        json!({"type":"duplicate_layer","id":"a","newId":"copy"}),
        json!({"type":"add_layer","kind":"text","newId":"text","afterId":"copy"}),
        json!({"type":"edit_layer","id":"text","patch":{"content":"Hello","scaleX":1.5,"rotation":20}}),
        json!({"type":"delete_layer","id":"copy"}),
    ] {
        assert!(run(&mut s, command));
        states.push(s.export_json());
    }
    for expected in states[..states.len() - 1].iter().rev() {
        assert!(s.undo());
        assert_eq!(&s.export_json(), expected);
    }
    assert!(!s.can_undo());
    for expected in &states[1..] {
        assert!(s.redo());
        assert_eq!(&s.export_json(), expected);
    }
    assert_eq!(
        DocumentSession::open(&s.export_json())
            .unwrap()
            .export_json(),
        s.export_json()
    );
}
#[test]
fn reorder_uses_graph_order_and_deletion_bypasses_layer() {
    let mut s = DocumentSession::open(&source()).unwrap();
    run(&mut s, json!({"type":"move_layer","id":"a","delta":1}));
    let plan: Value = serde_json::from_str(&s.render_plan_json(100, 100).unwrap()).unwrap();
    assert_eq!(plan["layers"][0]["id"], "b");
    assert_eq!(plan["layers"][1]["id"], "a");
    s.undo();
    run(&mut s, json!({"type":"delete_layer","id":"b"}));
    let p: Value = serde_json::from_str(&s.export_json()).unwrap();
    assert_eq!(p["document"]["graph"]["edges"][0]["fromId"], "a");
    assert_eq!(p["document"]["graph"]["edges"][0]["toId"], "__export__");
    assert_eq!(p["document"]["graph"]["areas"][0]["nodeIds"], json!(["a"]));
    s.undo();
    assert_eq!(s.export_json(), source());
}
#[test]
fn connections_cycle_guard_disconnected_nodes_and_metadata_history() {
    let mut s = DocumentSession::open(&source()).unwrap();
    let initial = s.export_json();
    assert!(
        s.execute(r#"{"type":"connect","from":"b","to":"a"}"#)
            .is_err()
    );
    assert_eq!(s.export_json(), initial);
    run(&mut s, json!({"type":"disconnect","to":"b"}));
    assert!(
        s.execute(r#"{"type":"move_layer","id":"a","delta":1}"#)
            .is_err()
    );
    run(&mut s, json!({"type":"connect","from":"a","to":"b"}));
    let plan = s.render_plan_json(100, 100).unwrap();
    run(&mut s, json!({"type":"move_node","id":"a","x":400,"y":220}));
    assert_eq!(plan, s.render_plan_json(100, 100).unwrap());
    s.undo();
    s.undo();
    s.undo();
    assert_eq!(s.export_json(), initial);
}
#[test]
fn locks_and_invalid_edits_are_atomic_and_keep_redo() {
    let mut s = DocumentSession::open(&source()).unwrap();
    run(
        &mut s,
        json!({"type":"edit_layer","id":"a","patch":{"locked":true}}),
    );
    let locked = s.export_json();
    assert!(s.execute(r#"{"type":"delete_layer","id":"a"}"#).is_err());
    assert!(
        s.execute(r#"{"type":"move_layer","id":"b","delta":-1}"#)
            .is_err()
    );
    assert_eq!(s.export_json(), locked);
    s.undo();
    let before = s.export_json();
    for c in [
        json!({"type":"edit_layer","id":"a","patch":{"color":"no","name":"mutated"}}),
        json!({"type":"connect","from":"missing","to":"a"}),
        json!({"type":"add_layer","kind":"text","newId":"a"}),
        json!({"type":"move_node","id":"missing","x":0,"y":0}),
    ] {
        assert!(s.execute(&c.to_string()).is_err());
        assert_eq!(s.export_json(), before);
        assert!(s.can_redo());
    }
    assert!(!run(
        &mut s,
        json!({"type":"edit_layer","id":"a","patch":{"color":"#ffffff"}})
    ));
    assert!(s.can_redo());
}
#[test]
fn blank_create_and_supported_properties_render() {
    let mut s = DocumentSession::open(&DocumentSession::blank_json()).unwrap();
    for (kind, id) in [
        ("fill", "f"),
        ("text", "t"),
        ("emoji", "e"),
        ("effect", "fx"),
    ] {
        run(&mut s, json!({"type":"add_layer","kind":kind,"newId":id}));
    }
    run(
        &mut s,
        json!({"type":"edit_layer","id":"fx","patch":{"grain":30,"vortex":40,"tearAmt":4,"ca":12}}),
    );
    run(
        &mut s,
        json!({"type":"edit_layer","id":"e","patch":{"density":10,"minSz":10,"maxSz":30,"emojis":["🌑"]}}),
    );
    assert!(s.render_plan_json(100, 100).is_ok());
    let before = s.export_json();
    assert!(
        s.execute(r#"{"type":"edit_layer","id":"e","patch":{"minSz":40,"maxSz":30}}"#)
            .is_err()
    );
    assert_eq!(s.export_json(), before);
}
#[test]
fn unsupported_graph_structures_are_preserved() {
    let mut p: Value = serde_json::from_str(&source()).unwrap();
    p["document"]["graph"]["mergeNodes"] = json!([{"id":"m"}]);
    let original = p.to_string();
    let mut s = DocumentSession::open(&original).unwrap();
    assert!(s.execute(r#"{"type":"delete_layer","id":"a"}"#).is_err());
    assert_eq!(s.export_json(), original);
}

#[test]
fn pointer_drafts_leave_package_and_history_untouched() {
    let mut s = DocumentSession::open(&DocumentSession::blank_json()).unwrap();
    run(
        &mut s,
        json!({"type":"add_layer","kind":"text","newId":"t"}),
    );
    run(
        &mut s,
        json!({"type":"edit_layer","id":"t","patch":{"content":"Final"}}),
    );
    s.undo();
    let saved = s.export_json();
    let plan = s.render_plan_json(500, 500).unwrap();
    let draft = s
        .draft_plan_json("t", r#"{"x":0.8,"rotation":20}"#, 500)
        .unwrap();
    assert_ne!(plan, draft);
    assert_eq!(saved, s.export_json());
    assert!(s.can_redo());
    for patch in [r#"{"content":"forbidden"}"#, r#"{"x":100}"#] {
        assert!(s.draft_plan_json("t", patch, 500).is_err());
        assert_eq!(saved, s.export_json());
        assert!(s.can_redo());
    }
}
