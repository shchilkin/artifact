use artifact_core::DocumentSession;
use serde_json::{Value, json};

fn source() -> String {
    json!({"artifactPackage":"project","manifest":{"kind":"artifact-project-package","version":1,"documentSchemaVersion":3},
        "unknownPackage":{"null":null,"keep":true},"document":{"schemaVersion":3,
        "global":{"aspect":"1:1","bg":"transparent","seed":1,"extra":null},
        "layers":[{"id":"a","kind":"text","content":"A","x":0.5,"locked":false,"visible":true,"opaque":{"nested":null}},
                  {"id":"b","kind":"image","src":"artifact-asset://large-image","x":0.5,"locked":false,"visible":true}],
        "export":{"format":"png","scale":1,"target":"cover","unknown":null},"graph":null,"custom":[]}}).to_string()
}
fn call(s: &mut DocumentSession, method: &str, request: Value) -> Value {
    let input = request.to_string();
    let output = match method {
        "begin" => s.begin_transaction_json(&input),
        "update" => s.update_transaction_json(&input),
        "commit" => s.commit_transaction_json(&input),
        "cancel" => s.cancel_transaction_json(&input),
        _ => unreachable!(),
    };
    serde_json::from_str(&output).unwrap()
}
fn begin(s: &mut DocumentSession) -> u64 {
    let result = call(
        s,
        "begin",
        json!({"version":1,"expectedRevision":s.revision()}),
    );
    assert_eq!(result["ok"], true, "{result}");
    result["transactionId"].as_u64().unwrap()
}
fn update(s: &mut DocumentSession, id: u64, commands: Value) -> Value {
    call(
        s,
        "update",
        json!({"version":1,"transactionId":id,"commands":commands}),
    )
}
fn end(s: &mut DocumentSession, method: &str, id: u64) -> Value {
    call(s, method, json!({"version":1,"transactionId":id}))
}
fn doc(s: &DocumentSession) -> Value {
    serde_json::from_str::<Value>(&s.export_json()).unwrap()["document"].clone()
}

#[test]
fn imported_font_and_layer_reference_are_one_atomic_history_step() {
    let mut s = DocumentSession::open(&source()).unwrap();
    let original = s.export_json();
    let id = begin(&mut s);
    let font = json!({"id":"local-1","dataUrl":"data:font/ttf;base64,AA==","mime":"font/ttf",
        "bytes":1,"label":"Local","family":"Local","createdAt":"2026-09-25",
        "source":"local-file","embeddingPolicy":"user-confirmed-required","future":{"keep":true}});
    let asset_reply = update(
        &mut s,
        id,
        json!([{"type":"edit_assets","collection":"fontAssets","upsert":[font]}]),
    );
    assert_eq!(asset_reply["ok"], true, "{asset_reply}");
    assert_eq!(asset_reply["changes"]["assets"], json!(["fontAssets"]));
    let patch_reply = update(
        &mut s,
        id,
        json!([{"type":"patch_layer","id":"a","patch":{"font":"artifact-font://local-1"}}]),
    );
    assert_eq!(patch_reply["ok"], true, "{patch_reply}");
    let committed = end(&mut s, "commit", id);
    assert_eq!(committed["revision"], 1);
    assert_eq!(doc(&s)["fontAssets"][0]["future"], json!({"keep":true}));
    assert_eq!(doc(&s)["layers"][0]["font"], "artifact-font://local-1");
    assert!(s.undo());
    assert_eq!(s.export_json(), original);
    assert!(s.redo());
    assert_eq!(doc(&s)["layers"][0]["font"], "artifact-font://local-1");
    let second = begin(&mut s);
    assert_eq!(
        update(
            &mut s,
            second,
            json!([{"type":"edit_assets","collection":"fontAssets","removeIds":["local-1"]}])
        )["ok"],
        true
    );
    assert_eq!(end(&mut s, "cancel", second)["changed"], true);
    assert_eq!(doc(&s)["fontAssets"][0]["id"], "local-1");
}

#[test]
fn root_asset_edits_validate_and_preserve_absent_vs_empty() {
    let mut s = DocumentSession::open(&source()).unwrap();
    let id = begin(&mut s);
    assert_eq!(
        update(
            &mut s,
            id,
            json!([{"type":"edit_assets","collection":"envAssets","removeIds":["missing"]}])
        )["changed"],
        false
    );
    assert!(doc(&s).get("envAssets").is_none());
    let invalid = update(
        &mut s,
        id,
        json!([{"type":"edit_assets","collection":"fontAssets","upsert":[{"id":"dup"},{"id":"dup"}]}]),
    );
    assert_eq!(invalid["error"]["code"], "INVALID_TARGET");
    assert!(doc(&s).get("fontAssets").is_none());
    let replacement = update(
        &mut s,
        id,
        json!([{"type":"edit_assets","collection":"envAssets","replace":[]}]),
    );
    assert_eq!(replacement["ok"], true, "{replacement}");
    assert_eq!(doc(&s)["envAssets"], json!([]));
    assert_eq!(end(&mut s, "commit", id)["revision"], 1);
    assert!(s.undo());
    assert!(doc(&s).get("envAssets").is_none());
}

#[test]
fn large_asset_update_is_cold_bounded_and_upsert_preserves_metadata() {
    let mut s = DocumentSession::open(&source()).unwrap();
    let id = begin(&mut s);
    let payload = format!("data:font/ttf;base64,{}", "A".repeat(2 * 1024 * 1024));
    let inserted = update(
        &mut s,
        id,
        json!([{"type":"edit_assets","collection":"fontAssets",
        "upsert":[{"id":"large","dataUrl":payload,"future":{"keep":true}}]}]),
    );
    assert_eq!(inserted["ok"], true, "{inserted}");
    let merged = update(
        &mut s,
        id,
        json!([{"type":"edit_assets","collection":"fontAssets",
        "upsert":[{"id":"large","label":"Changed"}]}]),
    );
    assert_eq!(merged["ok"], true, "{merged}");
    assert_eq!(doc(&s)["fontAssets"][0]["future"], json!({"keep":true}));
    assert_eq!(doc(&s)["fontAssets"][0]["label"], "Changed");
    assert_eq!(end(&mut s, "commit", id)["ok"], true);
    assert!(s.undo());
    assert!(doc(&s).get("fontAssets").is_none());
}

#[test]
fn shared_web_tile_and_long_text_properties_accept_within_envelope() {
    let mut s = DocumentSession::open(&source()).unwrap();
    let id = begin(&mut s);
    let long_content = "x".repeat(20_000);
    let long_name = "N".repeat(250);
    let updated = update(
        &mut s,
        id,
        json!([
            {"type":"patch_layer","id":"a","patch":{"content":long_content,"name":long_name}},
            {"type":"patch_layer","id":"b","patch":{"fit":"tile"}}
        ]),
    );
    assert_eq!(updated["ok"], true, "{updated}");
    assert_eq!(end(&mut s, "commit", id)["revision"], 1);
    assert_eq!(
        doc(&s)["layers"][0]["content"].as_str().unwrap().len(),
        20_000
    );
    assert_eq!(doc(&s)["layers"][0]["name"].as_str().unwrap().len(), 250);
    assert_eq!(doc(&s)["layers"][1]["fit"], "tile");
    assert!(s.undo());
    assert!(doc(&s)["layers"][1].get("fit").is_none());
}

#[test]
fn replace_document_preserves_package_metadata_and_unknown_json() {
    let mut s = DocumentSession::open(&source()).unwrap();
    let original = s.export_json();
    let mut replacement = doc(&s);
    replacement["layers"] =
        json!([{"id":"fresh","kind":"text","content":"New","font":"DISPLAY","future":null}]);
    replacement["futureDocument"] = json!({"nested":[null,42]});
    replacement.as_object_mut().unwrap().remove("graph");
    let id = begin(&mut s);
    let invalid = update(
        &mut s,
        id,
        json!([{"type":"replace_document","document":{"schemaVersion":3,"global":{},"export":{},"layers":[{"id":"same","kind":"text"},{"id":"same","kind":"text"}]}}]),
    );
    assert_eq!(invalid["error"]["code"], "INVALID_VALUE");
    assert_eq!(s.export_json(), original);
    let accepted = update(
        &mut s,
        id,
        json!([{"type":"replace_document","document":replacement}]),
    );
    assert_eq!(accepted["ok"], true, "{accepted}");
    assert_eq!(accepted["changes"]["document"], true);
    assert_eq!(end(&mut s, "commit", id)["revision"], 1);
    let package: Value = serde_json::from_str(&s.export_json()).unwrap();
    assert_eq!(package["manifest"]["kind"], "artifact-project-package");
    assert_eq!(package["unknownPackage"], json!({"null":null,"keep":true}));
    assert_eq!(
        package["document"]["futureDocument"],
        json!({"nested":[null,42]})
    );
    assert!(package["document"].get("graph").is_none());
    let reopened = DocumentSession::open(&s.export_durable_json().unwrap()).unwrap();
    assert_eq!(reopened.export_json(), s.export_json());
    assert!(s.undo());
    assert_eq!(
        serde_json::from_str::<Value>(&s.export_json()).unwrap(),
        serde_json::from_str::<Value>(&original).unwrap()
    );
    assert!(s.redo());
    assert_eq!(doc(&s)["layers"][0]["id"], "fresh");
}

#[test]
fn gesture_is_one_undo_and_updates_only_touched_fields() {
    let mut s = DocumentSession::open(&source()).unwrap();
    let initial = s.export_json();
    let id = begin(&mut s);
    assert!(s.export_durable_json().is_err());
    for (draft, x) in [(1, 0.6), (2, 0.8), (3, 1.1)] {
        let result = update(
            &mut s,
            id,
            json!([{"type":"patch_layer","id":"a","patch":{"x":x}}]),
        );
        assert_eq!(result["ok"], true, "{result}");
        assert_eq!(result["revision"], 0);
        assert_eq!(result["draftRevision"], draft);
        assert_eq!(result["changes"]["layers"]["a"], json!(["x"]));
        assert!(result.to_string().len() < 400);
    }
    let committed = end(&mut s, "commit", id);
    assert_eq!(committed["changed"], true);
    assert_eq!(committed["revision"], 1);
    assert_eq!(doc(&s)["layers"][0]["x"], 1.1);
    assert!(s.undo());
    assert_eq!(s.export_json(), initial);
    assert!(!s.can_undo());
    assert!(s.redo());
    assert_eq!(doc(&s)["layers"][0]["x"], 1.1);
}

#[test]
fn failed_batch_restores_prior_draft_and_redo_with_absent_vs_null() {
    let mut s = DocumentSession::open(&source()).unwrap();
    assert!(
        s.execute(r#"{"type":"edit_layer","id":"a","patch":{"content":"Changed"}}"#)
            .unwrap()
    );
    assert!(s.undo());
    let before = s.export_json();
    let revision = s.revision();
    let id = begin(&mut s);
    assert_eq!(
        update(
            &mut s,
            id,
            json!([{"type":"patch_layer","id":"a","patch":{"x":0.7}}])
        )["ok"],
        true
    );
    let prior_draft = s.export_json();
    let failed = update(
        &mut s,
        id,
        json!([
            {"type":"bridge","capability":"web:layer-property","target":{"scope":"layer_field","id":"a","field":"newNull"},"value":null},
            {"type":"patch_layer","id":"b","patch":{"x":999}}
        ]),
    );
    assert_eq!(failed["ok"], false);
    assert_eq!(failed["error"]["code"], "COMMAND_REJECTED");
    assert_eq!(failed["draftRevision"], 1);
    assert_eq!(s.export_json(), prior_draft);
    assert!(doc(&s)["layers"][0].get("newNull").is_none());
    assert_eq!(end(&mut s, "cancel", id)["ok"], true);
    assert_eq!(s.export_json(), before);
    assert_eq!(s.revision(), revision);
    assert!(s.can_redo());
}

#[test]
fn net_zero_and_rejected_commands_keep_revision_and_redo() {
    let mut s = DocumentSession::open(&source()).unwrap();
    s.execute(r#"{"type":"edit_layer","id":"a","patch":{"content":"B"}}"#)
        .unwrap();
    s.undo();
    let before = s.export_json();
    let revision = s.revision();
    assert_eq!(
        call(
            &mut s,
            "begin",
            json!({"version":1,"expectedRevision":revision-1})
        )["error"]["code"],
        "REVISION_CONFLICT"
    );
    let id = begin(&mut s);
    assert_eq!(
        update(
            &mut s,
            id,
            json!([{"type":"patch_layer","id":"a","patch":{"x":0.8}}])
        )["ok"],
        true
    );
    assert_eq!(
        update(
            &mut s,
            id,
            json!([{"type":"patch_layer","id":"a","patch":{"x":0.5}}])
        )["ok"],
        true
    );
    assert_eq!(end(&mut s, "commit", id)["changed"], false);
    assert_eq!(s.export_json(), before);
    assert_eq!(s.revision(), revision);
    assert!(s.can_redo());
    assert_eq!(
        end(&mut s, "commit", id)["error"]["code"],
        "STALE_TRANSACTION"
    );
    let id = begin(&mut s);
    assert_eq!(
        update(
            &mut s,
            id,
            json!([{"type":"patch_layer","id":"a","patch":{"content":"Fresh"}}])
        )["ok"],
        true
    );
    end(&mut s, "commit", id);
    assert!(!s.can_redo());
}

#[test]
fn layer_order_is_independent_of_graph_and_locks_are_guarded() {
    let mut s = DocumentSession::open(&source()).unwrap();
    let graph = doc(&s)["graph"].clone();
    let id = begin(&mut s);
    assert_eq!(
        update(
            &mut s,
            id,
            json!([{"type":"move_layer","id":"b","delta":-1}])
        )["ok"],
        true
    );
    end(&mut s, "commit", id);
    assert_eq!(doc(&s)["layers"][0]["id"], "b");
    assert_eq!(doc(&s)["graph"], graph);
    assert!(s.undo());
    assert_eq!(doc(&s)["layers"][0]["id"], "a");
    let id = begin(&mut s);
    assert_eq!(
        update(
            &mut s,
            id,
            json!([{"type":"patch_layer","id":"a","patch":{"locked":true}}])
        )["ok"],
        true
    );
    end(&mut s, "commit", id);
    let id = begin(&mut s);
    for command in [
        json!({"type":"move_layer","id":"b","delta":-1}),
        json!({"type":"remove_layer","id":"a"}),
    ] {
        let result = update(&mut s, id, json!([command]));
        assert_eq!(result["ok"], false, "{result}");
    }
    assert_eq!(
        update(
            &mut s,
            id,
            json!([{"type":"patch_layer","id":"a","patch":{"content":"Still editable"}}])
        )["ok"],
        true
    );
    end(&mut s, "commit", id);
}

#[test]
fn mixed_legacy_transaction_and_structure_history_uses_stable_ids() {
    let mut s = DocumentSession::open(&source()).unwrap();
    assert!(s.set_text("a", r#"{"content":"Legacy"}"#).unwrap());
    let id = begin(&mut s);
    assert_eq!(
        update(
            &mut s,
            id,
            json!([
                {"type":"patch_layer","id":"b","patch":{"x":0.8}},
                {"type":"move_layer","id":"b","delta":-1},
                {"type":"patch_global","patch":{"aspect":"4:5","bg":"#112233","seed":42}},
                {"type":"patch_export","patch":{"format":"jpeg","scale":2}}
            ])
        )["ok"],
        true
    );
    assert_eq!(end(&mut s, "commit", id)["revision"], 2);
    assert_eq!(doc(&s)["layers"][0]["id"], "b");
    assert!(s.undo());
    assert_eq!(doc(&s)["layers"][1]["id"], "b");
    assert_eq!(doc(&s)["layers"][1]["x"], 0.5);
    assert_eq!(doc(&s)["layers"][0]["content"], "Legacy");
    assert!(s.undo());
    assert_eq!(doc(&s)["layers"][0]["content"], "A");
    assert!(s.redo());
    assert!(s.redo());
    assert_eq!(doc(&s)["layers"][0]["x"], 0.8);
}

#[test]
fn structural_net_zero_preserves_redo_and_unknown_data() {
    let mut s = DocumentSession::open(&source()).unwrap();
    s.execute(r#"{"type":"edit_layer","id":"a","patch":{"content":"B"}}"#)
        .unwrap();
    s.undo();
    let before = s.export_json();
    let id = begin(&mut s);
    assert_eq!(
        update(
            &mut s,
            id,
            json!([{"type":"move_layer","id":"b","delta":-1}])
        )["ok"],
        true
    );
    assert_eq!(
        update(
            &mut s,
            id,
            json!([{"type":"move_layer","id":"b","delta":1}])
        )["ok"],
        true
    );
    assert_eq!(end(&mut s, "commit", id)["changed"], false);
    assert_eq!(s.export_json(), before);
    assert!(s.can_redo());
}

#[test]
fn multi_item_and_reference_edits_validate_atomically() {
    let mut s = DocumentSession::open(&source()).unwrap();
    let id = begin(&mut s);
    let before = s.export_json();
    let failed = update(
        &mut s,
        id,
        json!([{"type":"patch_layers","ids":["a","missing"],"patch":{"visible":false}}]),
    );
    assert_eq!(failed["ok"], false);
    assert_eq!(s.export_json(), before);
    assert_eq!(
        update(
            &mut s,
            id,
            json!([
                {"type":"patch_layers","ids":["a","b"],"patch":{"visible":false}},
                {"type":"patch_layer","id":"b","patch":{"src":"artifact-asset://replacement-2"}}
            ])
        )["ok"],
        true
    );
    end(&mut s, "commit", id);
    assert_eq!(
        doc(&s)["layers"][1]["src"],
        "artifact-asset://replacement-2"
    );
    assert_eq!(doc(&s)["layers"][0]["visible"], false);
    assert!(s.undo());
    assert_eq!(s.export_json(), before);
}

#[test]
fn transaction_reorder_does_not_rebuild_mismatched_or_nonlinear_graph() {
    let mut package: Value = serde_json::from_str(&source()).unwrap();
    package["document"]["graph"] = json!({"edges":[
        {"id":"b-out","fromId":"b","fromPort":"out","toId":"__export__","toPort":"in"},
        {"id":"a-other","fromId":"a","fromPort":"out","toId":"utility","toPort":"a"}
    ],"positions":{},"mergeNodes":[{"id":"utility","unknown":null}],"unknown":{"keep":true}});
    let mut s = DocumentSession::open(&package.to_string()).unwrap();
    let graph = doc(&s)["graph"].clone();
    let id = begin(&mut s);
    let moved = update(
        &mut s,
        id,
        json!([{"type":"move_layer","id":"b","delta":-1}]),
    );
    assert_eq!(moved["ok"], true, "{moved}");
    end(&mut s, "commit", id);
    assert_eq!(doc(&s)["graph"], graph);
    assert_eq!(doc(&s)["layers"][0]["id"], "b");
    assert!(s.undo());
    assert_eq!(doc(&s)["graph"], graph);
    assert_eq!(doc(&s)["layers"][0]["id"], "a");
}

#[test]
fn explicit_bridge_preserves_unknown_and_validates_graph_scope() {
    let mut s = DocumentSession::open(&source()).unwrap();
    let id = begin(&mut s);
    let invalid = update(
        &mut s,
        id,
        json!([{"type":"bridge","capability":"web:graph","target":{"scope":"graph"},"value":{"edges":[{"id":"e","fromId":"missing","toId":"__export__"}]}}]),
    );
    assert_eq!(invalid["error"]["code"], "INVALID_VALUE");
    assert_eq!(doc(&s)["graph"], Value::Null);
    let valid = update(
        &mut s,
        id,
        json!([
            {"type":"bridge","capability":"web:layer-property","target":{"scope":"layer_field","id":"a","field":"webOnly"},"value":null},
            {"type":"bridge","capability":"web:export-envmap","target":{"scope":"export_field","field":"target"},"value":"envmap"}
        ]),
    );
    assert_eq!(valid["ok"], true, "{valid}");
    end(&mut s, "commit", id);
    assert!(doc(&s)["layers"][0].get("webOnly").unwrap().is_null());
    assert_eq!(doc(&s)["export"]["target"], "envmap");
    assert!(s.undo());
    assert!(doc(&s)["layers"][0].get("webOnly").is_none());
    assert_eq!(doc(&s)["export"]["target"], "cover");
}

#[test]
fn history_is_bounded_and_fixture_documents_keep_unknown_values() {
    let path = concat!(
        env!("CARGO_MANIFEST_DIR"),
        "/../../tests/fixtures/native-2d/text-font.artifact.json"
    );
    let fixture: Value = serde_json::from_str(&std::fs::read_to_string(path).unwrap()).unwrap();
    let original_font = fixture["fontAssets"].clone();
    let package = json!({"artifactPackage":"project","manifest":{"kind":"artifact-project-package","version":1,"documentSchemaVersion":3},"document":fixture}).to_string();
    let mut s = DocumentSession::open(&package).unwrap();
    for n in 0..55 {
        let id = begin(&mut s);
        let result = update(
            &mut s,
            id,
            json!([{"type":"patch_layer","id":"font-title","patch":{"x":0.5 + n as f64 / 100.0}}]),
        );
        assert_eq!(result["ok"], true, "{result}");
        end(&mut s, "commit", id);
    }
    assert_eq!(doc(&s)["fontAssets"], original_font);
    let mut count = 0;
    while s.undo() {
        count += 1;
    }
    assert!(count <= 50);
    assert!(count >= 1);
}

#[test]
fn net_zero_batch_does_not_advance_draft_or_report_changes() {
    let mut s = DocumentSession::open(&source()).unwrap();
    s.execute(r#"{"type":"edit_layer","id":"a","patch":{"content":"redo"}}"#)
        .unwrap();
    assert!(s.undo());
    let before = s.export_json();
    let revision = s.revision();
    let id = begin(&mut s);
    let reply = update(
        &mut s,
        id,
        json!([
            {"type":"patch_layer","id":"a","patch":{"x":0.6}},
            {"type":"patch_layer","id":"a","patch":{"x":0.5}}
        ]),
    );
    assert_eq!(reply["ok"], true, "{reply}");
    assert_eq!(reply["changed"], false);
    assert_eq!(reply["draftRevision"], 0);
    assert_eq!(reply["changes"]["layers"], json!({}));
    assert_eq!(s.export_json(), before);
    assert_eq!(s.revision(), revision);
    assert_eq!(end(&mut s, "commit", id)["changed"], false);
    assert!(s.can_redo());
}

#[test]
fn structure_bridge_preserves_retained_node_values_and_unknown_node_maps() {
    let mut package: Value = serde_json::from_str(&source()).unwrap();
    package["document"]["graph"] = json!({"edges":[{"id":"edge","fromId":"a","toId":"merge"}],
        "positions":{},"mergeNodes":[{"id":"merge","unknown":{"value":1}}],"colorNodes":[],
        "layoutNodes":{"future":"metadata"}});
    let mut s = DocumentSession::open(&package.to_string()).unwrap();
    let id = begin(&mut s);
    let before = s.export_json();
    let layers = doc(&s)["layers"].clone();
    let mut graph = doc(&s)["graph"].clone();
    graph["mergeNodes"][0]["unknown"]["value"] = json!(2);
    let rejected = update(
        &mut s,
        id,
        json!([{"type":"bridge_structure","capability":"web:structure",
        "layers":layers,"graph":{"present":true,"value":graph}}]),
    );
    assert_eq!(rejected["error"]["code"], "UNSUPPORTED_CAPABILITY");
    assert_eq!(s.export_json(), before);
    let mut graph = doc(&s)["graph"].clone();
    graph["edges"]
        .as_array_mut()
        .unwrap()
        .push(json!({"id":"edge2","fromId":"merge","toId":"__export__"}));
    let retained_layers = doc(&s)["layers"].clone();
    let accepted = update(
        &mut s,
        id,
        json!([{"type":"bridge_structure","capability":"web:structure",
        "layers":retained_layers,"graph":{"present":true,"value":graph}}]),
    );
    assert_eq!(accepted["ok"], true, "{accepted}");
    assert_eq!(
        doc(&s)["graph"]["layoutNodes"],
        json!({"future":"metadata"})
    );
    end(&mut s, "commit", id);
    assert!(s.undo());
    assert_eq!(s.export_json(), before);
}

#[test]
fn large_deleted_asset_uses_bounded_inverse_without_a_retained_baseline() {
    let mut package: Value = serde_json::from_str(&source()).unwrap();
    package["document"]["layers"][1]["src"] = json!(format!(
        "data:image/png;base64,{}",
        "A".repeat(34 * 1024 * 1024)
    ));
    let mut s = DocumentSession::open(&package.to_string()).unwrap();
    let before = s.export_json();
    let id = begin(&mut s);
    let remaining = json!([doc(&s)["layers"][0]]);
    let update_reply = update(
        &mut s,
        id,
        json!([{"type":"bridge_structure","capability":"web:structure","layers":remaining,
        "graph":{"present":true,"value":null}}]),
    );
    assert_eq!(update_reply["ok"], true, "{update_reply}");
    assert_eq!(end(&mut s, "commit", id)["changed"], true);
    assert!(s.undo());
    assert_eq!(s.export_json(), before);
}

#[test]
fn web_structure_bridge_preserves_unknowns_and_guards_locked_survivors() {
    let mut package: Value = serde_json::from_str(&source()).unwrap();
    package["document"]["layers"][0]["locked"] = json!(true);
    package["document"].as_object_mut().unwrap().remove("graph");
    package["document"]["layers"][1]["src"] = json!(format!(
        "data:image/png;base64,{}",
        "A".repeat(2 * 1024 * 1024)
    ));
    let mut s = DocumentSession::open(&package.to_string()).unwrap();
    let initial = s.export_json();
    let id = begin(&mut s);
    let original = doc(&s)["layers"].as_array().unwrap().clone();
    let noise = json!({"id":"noise","kind":"noise","unknown":{"null":null}});
    let primitive = json!({"id":"primitive","kind":"primitive","webOnly":true});
    let model = json!({"id":"model","kind":"model","asset":"artifact-asset://model"});
    let candidate = json!([noise, original[0], primitive, original[1], model]);
    let command = json!({"type":"bridge_structure","capability":"web:structure","layers":candidate,
        "graph":{"present":true,"value":{"edges":[{"id":"e","fromId":"primitive","toId":"__export__"}],
        "positions":{},"mergeNodes":[],"colorNodes":[],"unknown":{"preserve":null}}}});
    let accepted = update(&mut s, id, json!([command]));
    assert_eq!(accepted["ok"], true, "{accepted}");
    assert_eq!(accepted["changes"]["graph"], true);
    assert_eq!(accepted["changes"]["layers"]["noise"], json!(["*"]));
    assert!(doc(&s)["layers"][3]["src"].as_str().unwrap().len() > 2 * 1024 * 1024);
    let prior = s.export_json();
    let current = doc(&s)["layers"].as_array().unwrap().clone();
    let current_graph = doc(&s)["graph"].clone();
    let illegal = json!([current[0], current[2], current[1], current[3], current[4]]);
    let denied = update(
        &mut s,
        id,
        json!([{"type":"bridge_structure","capability":"web:structure","layers":illegal,"graph":{"present":true,"value":current_graph}}]),
    );
    assert_eq!(denied["error"]["code"], "LOCKED_LAYER");
    assert_eq!(s.export_json(), prior);
    let cancelled = end(&mut s, "cancel", id);
    assert_eq!(cancelled["changed"], true);
    assert_eq!(cancelled["changes"]["graph"], true);
    assert_eq!(s.export_json(), initial);
    assert_eq!(s.revision(), 0);
}

#[test]
fn long_gesture_coalesces_and_cancel_reports_net_restoration() {
    let mut s = DocumentSession::open(&source()).unwrap();
    let initial = s.export_json();
    let id = begin(&mut s);
    for n in 0..5000 {
        let result = update(
            &mut s,
            id,
            json!([{"type":"patch_layer","id":"a","patch":{"x":0.5 + (n + 1) as f64 / 10000.0}}]),
        );
        assert_eq!(result["ok"], true, "tick {n}: {result}");
    }
    let cancelled = end(&mut s, "cancel", id);
    assert_eq!(cancelled["changed"], true);
    assert_eq!(cancelled["changes"]["layers"]["a"], json!(["x"]));
    assert_eq!(s.export_json(), initial);
    assert_eq!(s.revision(), 0);
    assert!(!s.can_undo());
}
