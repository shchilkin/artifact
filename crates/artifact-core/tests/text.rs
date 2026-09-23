use artifact_core::DocumentSession;
use serde_json::{Value, json};
fn source() -> String {
    json!({"artifactPackage":"project","manifest":{"kind":"artifact-project-package","version":1,"documentSchemaVersion":3},"document":{"schemaVersion":3,"global":{"aspect":"1:1"},"export":{},"layers":[{"id":"text","kind":"text","content":"ВАЙБЕР","size":100,"color":"#ffffff","x":0.5,"y":0.2,"font":"artifact-font://keep","extra":{"keep":true}},{"id":"effect","kind":"effect","scanlines":38}],"fontAssets":[{"id":"keep","dataUrl":"unchanged"}],"graph":null}}).to_string()
}
#[test]
fn atomic_text_edit_preserves_assets_and_restores_exact_serialization() {
    let original = source();
    let mut s = DocumentSession::open(&original).unwrap();
    let patch = json!({"content":"ВАЙБЕР 2\nДжо","size":92,"color":"#ffcc00","x":0.45,"y":0.25});
    assert!(s.set_text("text", &patch.to_string()).unwrap());
    let mut expected: Value = serde_json::from_str(&original).unwrap();
    for (k, v) in patch.as_object().unwrap() {
        expected["document"]["layers"][0][k] = v.clone();
    }
    let changed = s.export_json();
    assert_eq!(serde_json::from_str::<Value>(&changed).unwrap(), expected);
    assert_eq!(
        s.summary().layers[0].text.as_ref().unwrap().content,
        "ВАЙБЕР 2\nДжо"
    );
    assert!(s.undo());
    assert_eq!(s.export_json(), original);
    assert!(!s.can_undo());
    assert!(s.redo());
    assert_eq!(s.export_json(), changed);
    assert_eq!(
        DocumentSession::open(&changed).unwrap().export_json(),
        changed
    );
}
#[test]
fn invalid_patch_is_atomic_and_keeps_redo() {
    let mut s = DocumentSession::open(&source()).unwrap();
    s.set_text("text", r##"{"color":"#ffee00"}"##).unwrap();
    s.undo();
    let before = s.export_json();
    for patch in [
        r#"{"content":"changed","size":0}"#,
        r#"{"size":541}"#,
        r#"{"x":4}"#,
        r#"{"y":null}"#,
        r#"{"color":"red"}"#,
        r#"{"font":"other"}"#,
        r#"{"content":5}"#,
        r#"{"size":1e999}"#,
        "[]",
        "broken",
    ] {
        assert!(s.set_text("text", patch).is_err(), "{patch}");
        assert_eq!(s.export_json(), before);
        assert!(s.can_redo());
    }
    assert!(s.set_text("effect", r#"{"content":"x"}"#).is_err());
    assert!(s.set_text("missing", "{}").is_err());
    assert!(
        s.set_text("text", &json!({"content":"x".repeat(16385)}).to_string())
            .is_err()
    );
}
#[test]
fn no_op_and_mixed_history_keep_order_and_branch_correctly() {
    let mut s = DocumentSession::open(&source()).unwrap();
    s.set_text("text", r#"{"content":"new"}"#).unwrap();
    let text = s.export_json();
    s.set_scanlines("effect", 50.0).unwrap();
    s.undo();
    assert_eq!(s.export_json(), text);
    assert!(
        !s.set_text("text", r#"{"content":"new","size":100.0}"#)
            .unwrap()
    );
    assert!(s.can_redo());
    s.set_text("text", r#"{"x":0.6}"#).unwrap();
    assert!(!s.can_redo());
    s.undo();
    assert_eq!(s.export_json(), text);
    s.undo();
    assert_eq!(s.export_json(), source());
}
#[test]
fn undo_removes_previously_absent_fields_and_empty_text_is_valid() {
    let mut p: Value = serde_json::from_str(&source()).unwrap();
    p["document"]["layers"][0]
        .as_object_mut()
        .unwrap()
        .remove("content");
    let original = p.to_string();
    let mut s = DocumentSession::open(&original).unwrap();
    s.set_text("text", r#"{"content":""}"#).unwrap();
    s.undo();
    assert_eq!(s.export_json(), original);
}
#[test]
fn text_edits_reach_render_plan_and_undo_restores_it() {
    let mut s = DocumentSession::open(&source()).unwrap();
    let before = s.render_plan_json(540, 540).unwrap();
    s.set_text("text", r#"{"content":"new","x":0.7}"#).unwrap();
    let changed = s.render_plan_json(540, 540).unwrap();
    assert_ne!(changed, before);
    assert!(changed.contains("new"));
    s.undo();
    assert_eq!(s.render_plan_json(540, 540).unwrap(), before);
}
