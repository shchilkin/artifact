use artifact_core::{DocumentSession, render::effect_rgba};
use serde_json::{Value, json};
fn package() -> Value {
    json!({"artifactPackage":"project","manifest":{"kind":"artifact-project-package","version":1,"documentSchemaVersion":3},"document":{"schemaVersion":3,"global":{"aspect":"1:1","seed":4242,"bg":"transparent"},"export":{},"layers":[{"id":"title","kind":"text"},{"id":"shadow","kind":"text"}],"graph":{"edges":[{"fromId":"shadow","fromPort":"out","toId":"title","toPort":"bg"},{"fromId":"title","fromPort":"out","toId":"__export__","toPort":"in"}]}}})
}
#[test]
fn graph_order_overrides_array_without_mutating_document() {
    let session = DocumentSession::open(&package().to_string()).unwrap();
    let before = session.export_json();
    let plan: Value = serde_json::from_str(&session.render_plan_json(540, 540).unwrap()).unwrap();
    assert_eq!(plan["layers"][0]["id"], "shadow");
    assert_eq!(plan["layers"][1]["id"], "title");
    assert_eq!(before, session.export_json());
}
#[test]
fn invalid_graphs_and_unsupported_effects_fail_explicitly() {
    let mut p = package();
    p["document"]["graph"]["edges"]
        .as_array_mut()
        .unwrap()
        .push(json!({"fromId":"title","fromPort":"out","toId":"shadow","toPort":"bg"}));
    assert!(
        DocumentSession::open(&p.to_string())
            .unwrap()
            .render_plan_json(540, 540)
            .is_err()
    );
    assert!(effect_rgba(vec![0; 16], 2, 2, "{\"blurAmt\":20}", 0).is_err());
    assert!(effect_rgba(vec![0; 16], 2, 2, "{\"maskAlpha\":true}", 0).is_err());
    assert!(effect_rgba(vec![0; 15], 2, 2, "{}", 0).is_err());
    assert!(effect_rgba(vec![], 4000, 4000, "{}", 0).is_err());
}
#[test]
fn scanlines_cover_even_rows_and_preserve_alpha_compositing() {
    let result = effect_rgba(
        vec![
            200, 100, 50, 255, 200, 100, 50, 255, 200, 100, 50, 255, 200, 100, 50, 255,
        ],
        2,
        2,
        "{\"scanlines\":50}",
        0,
    )
    .unwrap();
    assert_eq!(
        result,
        vec![
            100, 50, 25, 255, 100, 50, 25, 255, 200, 100, 50, 255, 200, 100, 50, 255
        ]
    );
    let transparent = effect_rgba(vec![0; 16], 2, 2, "{\"scanlines\":100}", 0).unwrap();
    assert_eq!(
        transparent,
        vec![0, 0, 0, 255, 0, 0, 0, 255, 0, 0, 0, 0, 0, 0, 0, 0]
    );
}
#[test]
fn edit_and_undo_change_render_plan_then_restore_it() {
    let mut p = package();
    p["document"]["graph"] = Value::Null;
    p["document"]["layers"] = json!([{"id":"scan","kind":"effect","scanlines":38}]);
    let mut s = DocumentSession::open(&p.to_string()).unwrap();
    let original = s.render_plan_json(540, 540).unwrap();
    s.set_scanlines("scan", 50.0).unwrap();
    assert_ne!(s.render_plan_json(540, 540).unwrap(), original);
    s.undo();
    assert_eq!(s.render_plan_json(540, 540).unwrap(), original);
}
#[test]
fn zero_effect_is_identity_and_seeded_grain_is_reproducible() {
    let input = vec![100; 64];
    assert_eq!(effect_rgba(input.clone(), 4, 4, "{}", 4242).unwrap(), input);
    let a = effect_rgba(input.clone(), 4, 4, "{\"grain\":100}", 4242).unwrap();
    assert_eq!(
        a,
        effect_rgba(input.clone(), 4, 4, "{\"grain\":100}", 4242).unwrap()
    );
    assert_ne!(
        a,
        effect_rgba(input, 4, 4, "{\"grain\":100}", 4243).unwrap()
    );
}
