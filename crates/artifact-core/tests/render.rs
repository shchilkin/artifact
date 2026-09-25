use artifact_core::{DocumentSession, render::effect_rgba};
use serde_json::{Value, json};
fn package() -> Value {
    json!({"artifactPackage":"project","manifest":{"kind":"artifact-project-package","version":1,"documentSchemaVersion":3},"document":{"schemaVersion":3,"global":{"aspect":"1:1","seed":4242,"bg":"transparent"},"export":{},"layers":[{"id":"title","kind":"text"},{"id":"shadow","kind":"text"}],"graph":{"edges":[{"id":"e1","fromId":"shadow","fromPort":"out","toId":"title","toPort":"bg"},{"id":"e2","fromId":"title","fromPort":"out","toId":"__export__","toPort":"in"}],"mergeNodes":[],"positions":{}}}})
}
fn graph_fixture(source: &str) -> DocumentSession {
    let document: Value = serde_json::from_str(source).unwrap();
    let mut project = package();
    project["document"] = document;
    DocumentSession::open(&project.to_string()).unwrap()
}
#[test]
fn branching_render_plan_keeps_ports_targets_and_document_immutable() {
    let session = graph_fixture(include_str!(
        "../../../tests/fixtures/native-2d/p09/combined.artifact.json"
    ));
    let before = session.export_json();
    let export: Value =
        serde_json::from_str(&session.render_plan_json(1920, 1080).unwrap()).unwrap();
    assert_eq!(export["version"], 2);
    assert_eq!(export["mode"], "graph");
    assert_eq!(export["background"], "transparent");
    assert_eq!(
        export["nodes"].as_array().unwrap().last().unwrap()["id"],
        "__export__"
    );
    let merge = export["nodes"]
        .as_array()
        .unwrap()
        .iter()
        .find(|n| n["id"] == "branch-merge")
        .unwrap();
    assert_eq!(merge["kind"], "merge");
    assert_eq!(merge["inputs"].as_array().unwrap().len(), 2);
    assert!(
        merge["inputs"]
            .as_array()
            .unwrap()
            .iter()
            .any(|i| i["port"] == "a")
    );
    assert!(
        merge["inputs"]
            .as_array()
            .unwrap()
            .iter()
            .any(|i| i["port"] == "b")
    );
    let target: Value = serde_json::from_str(
        &session
            .render_target_plan_json(1920, 1080, "branch-repeat")
            .unwrap(),
    )
    .unwrap();
    assert_eq!(target["targetId"], "branch-repeat");
    assert_eq!(target["nodes"].as_array().unwrap().len(), 2);
    assert_eq!(
        target["nodes"].as_array().unwrap().last().unwrap()["id"],
        "branch-repeat"
    );
    assert_eq!(before, session.export_json());
}
#[test]
fn graph_render_keys_propagate_pixel_changes_but_ignore_ui_metadata_and_revision() {
    let original: Value = serde_json::from_str(include_str!(
        "../../../tests/fixtures/native-2d/p09/combined.artifact.json"
    ))
    .unwrap();
    let plan = |document: Value| {
        let mut p = package();
        p["document"] = document;
        let session = DocumentSession::open(&p.to_string()).unwrap();
        let value: Value =
            serde_json::from_str(&session.render_plan_json(1920, 1080).unwrap()).unwrap();
        value["nodes"]
            .as_array()
            .unwrap()
            .iter()
            .map(|n| {
                (
                    n["id"].as_str().unwrap().to_owned(),
                    n["cacheKey"].as_str().unwrap().to_owned(),
                )
            })
            .collect::<std::collections::BTreeMap<_, _>>()
    };
    let base = plan(original.clone());
    let mut moved = original.clone();
    moved["graph"]["positions"]["branch-repeat"]["x"] = json!(999);
    moved["graph"]["repeatNodes"][0]["name"] = json!("Renamed");
    assert_eq!(base, plan(moved));
    let mut changed = original.clone();
    changed["graph"]["repeatNodes"][0]["count"] = json!(2);
    let next = plan(changed);
    assert_eq!(base["branch-ground"], next["branch-ground"]);
    assert_eq!(base["branch-art"], next["branch-art"]);
    for id in ["branch-repeat", "branch-mask", "branch-merge", "__export__"] {
        assert_ne!(base[id], next[id], "{id}");
    }
    let mut disconnected = original.clone();
    disconnected["layers"]
        .as_array_mut()
        .unwrap()
        .push(json!({"id":"spare","kind":"fill","color":"#abcdef"}));
    assert_eq!(base, plan(disconnected));
}
#[test]
fn empty_graph_export_is_explicit_and_invalid_targets_reject() {
    let session = graph_fixture(include_str!(
        "../../../tests/fixtures/native-2d/p09/export-empty-transparent.artifact.json"
    ));
    let plan: Value = serde_json::from_str(&session.render_plan_json(1920, 1080).unwrap()).unwrap();
    assert_eq!(plan["nodes"].as_array().unwrap().len(), 1);
    assert_eq!(plan["background"], "transparent");
    assert!(
        session
            .render_target_plan_json(1920, 1080, "missing")
            .is_err()
    );
}
#[test]
fn shared_upstream_is_planned_once_and_unsupported_paths_reject() {
    let mut document: Value = serde_json::from_str(include_str!(
        "../../../tests/fixtures/native-2d/p09/shared-upstream.artifact.json"
    ))
    .unwrap();
    let mut project = package();
    project["document"] = document.clone();
    let session = DocumentSession::open(&project.to_string()).unwrap();
    let plan: Value = serde_json::from_str(&session.render_plan_json(1920, 1080).unwrap()).unwrap();
    assert_eq!(
        plan["nodes"]
            .as_array()
            .unwrap()
            .iter()
            .filter(|n| n["id"] == "branch-art")
            .count(),
        1
    );
    let merge = plan["nodes"]
        .as_array()
        .unwrap()
        .iter()
        .find(|n| n["id"] == "branch-merge")
        .unwrap();
    assert!(
        merge["inputs"]
            .as_array()
            .unwrap()
            .iter()
            .any(|n| n["port"] == "a" && n["sourceId"] == "branch-art")
    );
    document["graph"]["futureNodes"] = json!([{"id":"unknown","config":{"a":1}}]);
    document["graph"]["edges"] = json!([{"id":"future-export","fromId":"unknown","fromPort":"out","toId":"__export__","toPort":"in"}]);
    project["document"] = document;
    let session = DocumentSession::open(&project.to_string()).unwrap();
    assert!(session.render_plan_json(1920, 1080).is_err());
}
#[test]
fn native_plan_accepts_four_aspects_blends_and_tiled_image_without_mutating_document() {
    let source: Value = serde_json::from_str(include_str!(
        "../../../tests/fixtures/native-2d/alpha-nonsquare.artifact.json"
    ))
    .unwrap();
    let mut p = package();
    p["document"] = source;
    p["document"]["layers"][0]["fit"] = json!("tile");
    p["document"]["layers"][0]["blendMode"] = json!("overlay");
    for (aspect, width, height) in [
        ("1:1", 1000, 1000),
        ("4:5", 1080, 1350),
        ("9:16", 1080, 1920),
        ("16:9", 1920, 1080),
    ] {
        p["document"]["global"]["aspect"] = json!(aspect);
        let session = DocumentSession::open(&p.to_string()).unwrap();
        let before = session.export_json();
        let plan: Value =
            serde_json::from_str(&session.render_plan_json(width, height).unwrap()).unwrap();
        assert_eq!(plan["width"], width);
        assert_eq!(plan["height"], height);
        assert_eq!(plan["layers"][0]["fit"], "tile");
        assert_eq!(plan["layers"][0]["blendMode"], "overlay");
        assert!(session.render_plan_json(height, width).is_err() || width == height);
        assert_eq!(session.export_json(), before);
    }
}
#[test]
fn chromatic_aberration_plan_uses_web_540px_reference_without_mutating_saved_value() {
    for (aspect, width, height, preview_width, preview_height) in [
        ("1:1", 1000, 1000, 500, 500),
        ("4:5", 1080, 1350, 400, 500),
        ("9:16", 1080, 1920, 281, 500),
        ("16:9", 1920, 1080, 500, 281),
    ] {
        let mut p = package();
        p["document"]["global"]["aspect"] = json!(aspect);
        p["document"]["layers"] = json!([{"id":"ca","kind":"effect","ca":7.5}]);
        p["document"]["graph"] = Value::Null;
        let session = DocumentSession::open(&p.to_string()).unwrap();
        let saved = session.export_json();
        for (w, h) in [(width, height), (preview_width, preview_height)] {
            let plan: Value =
                serde_json::from_str(&session.render_plan_json(w, h).unwrap()).unwrap();
            assert_eq!(
                plan["layers"][0]["ca"],
                json!((7.5_f64 * f64::from(w) / 540.0).round())
            );
            assert_eq!(session.export_json(), saved);
        }
    }
}
#[test]
fn native_plan_rejects_non_string_blend_modes() {
    let mut p = package();
    for invalid in [json!(42), json!({"mode":"overlay"}), json!(true), json!([])] {
        p["document"]["layers"][0]["blendMode"] = invalid;
        let session = DocumentSession::open(&p.to_string()).unwrap();
        assert!(session.render_plan_json(540, 540).is_err());
    }
    for valid in [
        Value::Null,
        json!("normal"),
        json!("multiply"),
        json!("screen"),
        json!("overlay"),
        json!("darken"),
        json!("lighten"),
        json!("color-dodge"),
        json!("color-burn"),
        json!("hard-light"),
        json!("soft-light"),
        json!("difference"),
        json!("exclusion"),
        json!("hue"),
        json!("saturation"),
        json!("color"),
        json!("luminosity"),
    ] {
        p["document"]["layers"][0]["blendMode"] = valid;
        let session = DocumentSession::open(&p.to_string()).unwrap();
        assert!(session.render_plan_json(540, 540).is_ok());
    }
    p["document"]["layers"][0]
        .as_object_mut()
        .unwrap()
        .remove("blendMode");
    let session = DocumentSession::open(&p.to_string()).unwrap();
    assert!(session.render_plan_json(540, 540).is_ok());
}
#[test]
fn draft_plan_bounds_size_before_non_square_dimension_math() {
    let source: Value = serde_json::from_str(include_str!(
        "../../../tests/fixtures/native-2d/alpha-nonsquare.artifact.json"
    ))
    .unwrap();
    let mut p = package();
    p["document"] = source;
    let session = DocumentSession::open(&p.to_string()).unwrap();
    assert!(
        session
            .draft_plan_json("alpha-image", "{\"x\":0.5}", 0)
            .is_err()
    );
    assert!(
        session
            .draft_plan_json("alpha-image", "{\"x\":0.5}", u32::MAX)
            .is_err()
    );
    let plan: Value = serde_json::from_str(
        &session
            .draft_plan_json("alpha-image", "{\"x\":0.5}", 500)
            .unwrap(),
    )
    .unwrap();
    assert_eq!(
        (plan["width"].as_u64(), plan["height"].as_u64()),
        (Some(400), Some(500))
    );
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

#[test]
fn render_plan_scales_pixel_effect_from_web_reference_without_mutating_document() {
    let mut p = package();
    p["document"]["graph"] = Value::Null;
    p["document"]["layers"] = json!([{"id":"ca","kind":"effect","ca":27}]);
    let session = DocumentSession::open(&p.to_string()).unwrap();
    let before = session.export_json();
    let preview: Value =
        serde_json::from_str(&session.render_plan_json(1000, 1000).unwrap()).unwrap();
    let export: Value =
        serde_json::from_str(&session.render_plan_json(3000, 3000).unwrap()).unwrap();
    assert_eq!(preview["layers"][0]["ca"].as_f64(), Some(50.0));
    assert_eq!(export["layers"][0]["ca"].as_f64(), Some(150.0));
    assert_eq!(session.export_json(), before);
}
