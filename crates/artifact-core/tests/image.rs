use artifact_core::DocumentSession;
use serde_json::{Value, json};
const PNG: &str = "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAAC0lEQVR42mP8/x8AAwMCAO+j9uoAAAAASUVORK5CYII=";
fn source() -> String {
    json!({"artifactPackage":"project","manifest":{"kind":"artifact-project-package","version":1,"documentSchemaVersion":3},"document":{"schemaVersion":3,"global":{"aspect":"1:1"},"export":{},"layers":[{"id":"image","kind":"image","src":"old preserved payload","fit":"contain","x":0.5,"y":0.5,"scaleX":1,"scaleY":1,"rotation":0,"extra":{"keep":true}},{"id":"effect","kind":"effect","scanlines":38}],"graph":null,"fontAssets":[{"dataUrl":"keep"}]}}).to_string()
}
#[test]
fn replacement_and_transform_are_one_lossless_undo_step() {
    let original = source();
    let mut session = DocumentSession::open(&original).unwrap();
    let patch = json!({"src":PNG,"x":0.3,"y":0.6,"scaleX":0.7,"scaleY":1.2,"rotation":30});
    assert!(session.set_image("image", &patch.to_string()).unwrap());
    let mut expected: Value = serde_json::from_str(&original).unwrap();
    for (k, v) in patch.as_object().unwrap() {
        expected["document"]["layers"][0][k] = v.clone();
    }
    let changed = session.export_json();
    assert_eq!(serde_json::from_str::<Value>(&changed).unwrap(), expected);
    assert!(!session.summary_json().contains("base64"));
    assert_eq!(
        session.summary().layers[0].image.as_ref().unwrap().rotation,
        30.0
    );
    let plan: Value = serde_json::from_str(&session.render_plan_json(1000, 1000).unwrap()).unwrap();
    assert_eq!(plan["layers"][0], expected["document"]["layers"][0]);
    assert!(session.undo());
    assert_eq!(session.export_json(), original);
    assert!(!session.can_undo());
    assert!(session.redo());
    assert_eq!(session.export_json(), changed);
    assert_eq!(
        DocumentSession::open(&changed).unwrap().export_json(),
        changed
    );
}
#[test]
fn invalid_imports_and_transform_patches_preserve_document_and_redo() {
    let mut s = DocumentSession::open(&source()).unwrap();
    s.set_image("image", r#"{"x":0.4}"#).unwrap();
    s.undo();
    let original = s.export_json();
    for patch in [
        json!({"src":"https://example.com/image.png"}),
        json!({"src":"data:image/svg+xml;base64,PHN2Zz4="}),
        json!({"src":"data:image/png;base64,broken"}),
        json!({"x":0.6,"scaleY":0}),
        json!({"x":null}),
        json!({"y":3.1}),
        json!({"scaleX":10.01}),
        json!({"rotation":361}),
        json!({"fit":"cover"}),
        json!([]),
    ] {
        assert!(s.set_image("image", &patch.to_string()).is_err());
        assert_eq!(s.export_json(), original);
        assert!(s.can_redo());
    }
    assert!(s.set_image("effect", "{}").is_err());
    assert!(s.set_image("missing", "{}").is_err());
    assert!(s.set_image("image", r#"{"rotation":1e999}"#).is_err());
}
#[test]
fn no_op_preserves_redo_and_mixed_history_branches() {
    let mut s = DocumentSession::open(&source()).unwrap();
    s.set_image("image", &json!({"src":PNG}).to_string())
        .unwrap();
    let replaced = s.export_json();
    s.set_scanlines("effect", 50.0).unwrap();
    s.undo();
    assert!(
        !s.set_image("image", &json!({"src":PNG,"scaleX":1.0}).to_string())
            .unwrap()
    );
    assert!(s.can_redo());
    s.set_image("image", r#"{"rotation":-45}"#).unwrap();
    assert!(!s.can_redo());
    s.undo();
    assert_eq!(s.export_json(), replaced);
    s.undo();
    assert_eq!(s.export_json(), source());
}
#[test]
fn missing_fields_restore_and_dimensions_are_bounded() {
    use base64::{Engine, engine::general_purpose::STANDARD};
    let mut p: Value = serde_json::from_str(&source()).unwrap();
    p["document"]["layers"][0]
        .as_object_mut()
        .unwrap()
        .remove("rotation");
    let original = p.to_string();
    let mut s = DocumentSession::open(&original).unwrap();
    s.set_image("image", r#"{"rotation":45}"#).unwrap();
    s.undo();
    assert_eq!(s.export_json(), original);
    let mut png = STANDARD.decode(PNG.split(',').nth(1).unwrap()).unwrap();
    png[16..20].copy_from_slice(&4097u32.to_be_bytes());
    assert!(
        s.set_image(
            "image",
            &json!({"src":format!("data:image/png;base64,{}", STANDARD.encode(png))}).to_string()
        )
        .is_err()
    );
}
