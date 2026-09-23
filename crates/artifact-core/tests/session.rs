use artifact_core::DocumentSession;
use serde_json::{Value, json};

fn package() -> Value {
    json!({
        "artifactPackage": "project",
        "manifest": {"kind": "artifact-project-package", "version": 1, "documentSchemaVersion": 3, "unknown": [1,2]},
        "document": {
            "schemaVersion": 3,
            "global": {"seed": 4242, "bg": "transparent", "aspect": "1:1"},
            "export": {"format": "png", "scale": 3},
            "layers": [
                {"id": "scan", "kind": "effect", "name": "Scanlines", "scanlines": 38, "unknown": {"keep": true}},
                {"id": "image", "kind": "image", "src": "data:image/png;base64,unchanged"},
                {"id": "title", "kind": "text", "content": "ВАЙБЕР", "font": "artifact-font://font"}
            ],
            "graph": {"edges": [{"fromId": "scan", "toId": "__export__"}], "positions": {}},
            "fontAssets": [{"id": "font", "dataUrl": "data:font/ttf;base64,unchanged"}],
            "future": {"untouched": ["field", 42]}
        },
        "futurePackage": {"untouched": true}
    })
}

#[test]
fn edit_undo_redo_and_reopen_preserve_the_complete_package() {
    let original = package();
    let mut session = DocumentSession::open(&original.to_string()).unwrap();
    assert!(session.set_scanlines("scan", 50.0).unwrap());
    let mut expected = original.clone();
    expected["document"]["layers"][0]["scanlines"] = json!(50.0);
    assert_eq!(
        serde_json::from_str::<Value>(&session.export_json()).unwrap(),
        expected
    );
    assert!(session.undo());
    assert_eq!(
        serde_json::from_str::<Value>(&session.export_json()).unwrap(),
        original
    );
    assert!(session.redo());
    let reopened = DocumentSession::open(&session.export_json()).unwrap();
    assert_eq!(
        serde_json::from_str::<Value>(&reopened.export_json()).unwrap(),
        expected
    );
    assert!(!reopened.can_undo());
}

#[test]
fn invalid_commands_leave_document_and_history_unchanged() {
    let mut session = DocumentSession::open(&package().to_string()).unwrap();
    let before = session.export_json();
    for amount in [-1.0, 101.0, f64::NAN, f64::INFINITY] {
        assert!(session.set_scanlines("scan", amount).is_err());
    }
    assert!(session.set_scanlines("missing", 50.0).is_err());
    assert!(session.set_scanlines("image", 50.0).is_err());
    assert_eq!(session.export_json(), before);
    assert!(!session.can_undo());
    assert!(!session.undo());
    assert!(!session.redo());
}

#[test]
fn no_op_preserves_redo_and_a_new_edit_branches_history() {
    let mut session = DocumentSession::open(&package().to_string()).unwrap();
    session.set_scanlines("scan", 50.0).unwrap();
    session.undo();
    assert!(!session.set_scanlines("scan", 38.0).unwrap());
    assert!(session.can_redo());
    session.set_scanlines("scan", 60.0).unwrap();
    assert!(!session.can_redo());
    session.undo();
    assert_eq!(session.summary().layers[0].scanlines, Some(38.0));
}

#[test]
fn malformed_or_unsupported_packages_fail_before_opening() {
    for source in ["not JSON", "{}", "null", "[]"] {
        assert!(DocumentSession::open(source).is_err());
    }
    let mut value = package();
    value["document"]["schemaVersion"] = json!(999);
    assert!(DocumentSession::open(&value.to_string()).is_err());
    value = package();
    value["document"]["layers"][1]["id"] = json!("scan");
    assert!(DocumentSession::open(&value.to_string()).is_err());
}

#[test]
fn serialized_numbers_and_unknown_fields_survive_without_float_rounding() {
    let source = package().to_string().replace("4242", "0.5446792221047079");
    let mut session = DocumentSession::open(&source).unwrap();
    session.set_scanlines("scan", 50.0).unwrap();
    session.undo();
    assert!(session.export_json().contains("0.5446792221047079"));
    assert_eq!(session.export_json(), source);
}

#[test]
fn history_is_bounded_without_changing_the_present_document() {
    let mut session = DocumentSession::open(&package().to_string()).unwrap();
    for amount in 0..60 {
        session.set_scanlines("scan", amount as f64).unwrap();
    }
    let mut undo_count = 0;
    while session.undo() {
        undo_count += 1;
    }
    assert_eq!(undo_count, 50);
    assert_eq!(session.summary().layers[0].scanlines, Some(9.0));
    let mut redo_count = 0;
    while session.redo() {
        redo_count += 1;
    }
    assert_eq!(redo_count, 50);
    assert_eq!(session.summary().layers[0].scanlines, Some(59.0));
}
