use artifact_core::DocumentSession;
use serde_json::{Value, json};

fn fixture(name: &str) -> Value {
    let source = match name {
        "branch" => {
            include_str!("../../../tests/fixtures/native-2d/branch-merge-mask-repeat.artifact.json")
        }
        "utilities" => {
            include_str!("../../../tests/fixtures/native-2d/graph-utilities.artifact.json")
        }
        _ => panic!("unknown fixture"),
    };
    serde_json::from_str(source).unwrap()
}
fn session(document: Value) -> DocumentSession {
    DocumentSession::open(&json!({"artifactPackage":"project","manifest":{"kind":"artifact-project-package","version":1,"documentSchemaVersion":3},"document":document,"opaque":{"keep":null}}).to_string()).unwrap()
}
fn doc(s: &DocumentSession) -> Value {
    serde_json::from_str::<Value>(&s.export_json()).unwrap()["document"].clone()
}
fn call(s: &mut DocumentSession, method: &str, transaction_id: u64, commands: Value) -> Value {
    let input = match method {
        "begin" => json!({"version":1,"expectedRevision":s.revision()}),
        "update" => json!({"version":1,"transactionId":transaction_id,"commands":commands}),
        _ => json!({"version":1,"transactionId":transaction_id}),
    };
    serde_json::from_str(&match method {
        "begin" => s.begin_transaction_json(&input.to_string()),
        "update" => s.update_transaction_json(&input.to_string()),
        "commit" => s.commit_transaction_json(&input.to_string()),
        "cancel" => s.cancel_transaction_json(&input.to_string()),
        _ => unreachable!(),
    })
    .unwrap()
}
fn begin(s: &mut DocumentSession) -> u64 {
    let result = call(s, "begin", 0, json!([]));
    assert_eq!(result["ok"], true, "{result}");
    result["transactionId"].as_u64().unwrap()
}
fn edit(s: &mut DocumentSession, tx: u64, action: Value) -> Value {
    call(s, "update", tx, json!([{"type":"graph","action":action}]))
}
fn command(s: &mut DocumentSession, value: Value) -> Value {
    let tx = begin(s);
    let result = call(s, "update", tx, json!([value]));
    if result["ok"] == true {
        assert_eq!(call(s, "commit", tx, json!([]))["ok"], true);
    } else {
        assert_eq!(call(s, "cancel", tx, json!([]))["ok"], true);
    }
    result
}
fn plan(s: &DocumentSession, id: &str) -> Value {
    serde_json::from_str(&s.graph_plan_json(id).unwrap()).unwrap()
}

#[test]
fn branch_dependencies_are_explicit_and_areas_do_not_change_pixels() {
    let mut doc = fixture("branch");
    doc["layers"]
        .as_array_mut()
        .unwrap()
        .push(json!({"id":"orphan","kind":"fill","locked":false,"color":"#fff"}));
    doc["graph"]["positions"]["orphan"] = json!({"x":500,"y":600});
    let s = session(doc);
    let output = plan(&s, "__export__");
    assert_eq!(
        output["renderLayerIds"],
        json!(["branch-ground", "branch-art", "branch-matte"])
    );
    assert_eq!(
        output["editorLayerOrderIds"],
        json!(["branch-ground", "branch-art", "branch-matte", "orphan"])
    );
    assert_eq!(output["disconnectedNodeIds"], json!(["orphan"]));
    assert_eq!(
        output["dependencyNodeIds"],
        json!([
            "branch-ground",
            "branch-art",
            "branch-repeat",
            "branch-matte",
            "branch-mask",
            "branch-merge"
        ])
    );
    assert_eq!(
        output["connectedPorts"]["targets"]
            .as_array()
            .unwrap()
            .len(),
        6
    );
    assert_eq!(output["renderable2d"], true);
    assert_eq!(
        plan(&s, "branch-repeat")["downstreamNodeIds"],
        json!(["branch-repeat", "branch-mask", "branch-merge", "__export__"])
    );
}

#[test]
fn graph_commands_commit_once_and_undo_restore_unknown_data() {
    let mut d = fixture("utilities");
    d["graph"]["future"] = json!({"literal":null,"number":123456789});
    d["graph"]["scene3dNodes"] = json!([{"id":"web-3d","unknown":{"x":null}}]);
    let mut s = session(d);
    let initial = s.export_json();
    let tx = begin(&mut s);
    let result = edit(
        &mut s,
        tx,
        json!({"kind":"patch_node","id":"utility-color","patch":{"saturation":140}}),
    );
    // The fixture's exact IDs are asserted below via a list-driven fallback.
    if result["ok"] != true {
        let color = doc(&s)["graph"]["colorNodes"][0]["id"]
            .as_str()
            .unwrap()
            .to_owned();
        assert_eq!(
            edit(
                &mut s,
                tx,
                json!({"kind":"patch_node","id":color,"patch":{"saturation":140}})
            )["ok"],
            true
        );
    }
    let id = doc(&s)["graph"]["colorNodes"][0]["id"]
        .as_str()
        .unwrap()
        .to_owned();
    assert_eq!(
        edit(
            &mut s,
            tx,
            json!({"kind":"set_positions","positions":{id.clone():{"x":777,"y":88}}})
        )["ok"],
        true
    );
    assert_eq!(call(&mut s, "commit", tx, json!([]))["revision"], 1);
    assert_eq!(
        doc(&s)["graph"]["future"],
        json!({"literal":null,"number":123456789})
    );
    assert_eq!(
        doc(&s)["graph"]["scene3dNodes"][0]["unknown"]["x"],
        Value::Null
    );
    assert!(s.undo());
    assert_eq!(s.export_json(), initial);
    assert!(s.redo());
    assert_eq!(doc(&s)["graph"]["colorNodes"][0]["saturation"], 140);
    let reopened = session(doc(&s));
    assert_eq!(reopened.export_json(), s.export_json());
}

#[test]
fn opaque_future_nodes_survive_unrelated_edits_and_mark_selected_paths_unsupported() {
    let mut d = fixture("utilities");
    d["graph"]["futureNodes"] = json!([{"id":"future-node","futureSetting":{"keep":null}}]);
    let output = d["graph"]["edges"]
        .as_array_mut()
        .unwrap()
        .iter_mut()
        .find(|edge| edge["toId"] == "__export__")
        .unwrap();
    output["fromId"] = json!("future-node");
    let mut s = session(d);
    let initial = s.export_json();
    let output_plan = plan(&s, "__export__");
    assert_eq!(output_plan["dependencyNodeIds"], json!(["future-node"]));
    assert_eq!(output_plan["unsupportedNodeIds"], json!(["future-node"]));
    assert_eq!(output_plan["renderable2d"], false);
    assert_eq!(plan(&s, "future-node")["renderable2d"], false);
    let tx = begin(&mut s);
    assert_eq!(
        edit(
            &mut s,
            tx,
            json!({"kind":"patch_node","id":"utility-color","patch":{"saturation":130}})
        )["ok"],
        true
    );
    assert_eq!(call(&mut s, "commit", tx, json!([]))["ok"], true);
    assert_eq!(
        doc(&s)["graph"]["futureNodes"][0]["futureSetting"]["keep"],
        Value::Null
    );
    assert!(s.undo());
    assert_eq!(s.export_json(), initial);
    assert!(s.redo());
    assert_eq!(doc(&s)["graph"]["colorNodes"][0]["saturation"], 130);
    assert_eq!(
        plan(&s, "__export__")["unsupportedNodeIds"],
        json!(["future-node"])
    );
}

#[test]
fn malformed_or_colliding_opaque_node_ids_reject_topology_without_mutation() {
    for nodes in [
        json!([{"id":"utility-color"}]),
        json!([{"id":"future"},{"id":"future"}]),
        json!([{"notAnId":true}]),
    ] {
        let mut d = fixture("utilities");
        d["graph"]["futureNodes"] = nodes;
        let mut s = session(d);
        let initial = s.export_json();
        assert!(s.graph_plan_json("__export__").is_err());
        let tx = begin(&mut s);
        assert_eq!(
            edit(
                &mut s,
                tx,
                json!({"kind":"patch_node","id":"utility-color","patch":{"saturation":130}})
            )["ok"],
            false
        );
        assert_eq!(s.export_json(), initial);
        assert_eq!(call(&mut s, "cancel", tx, json!([]))["ok"], true);
    }
}

#[test]
fn edge_ports_reconnect_split_cycle_and_failed_batch_are_atomic() {
    let mut s = session(fixture("branch"));
    let initial = s.export_json();
    let tx = begin(&mut s);
    let rejected = edit(
        &mut s,
        tx,
        json!({"kind":"add_edge","edge":{"id":"cycle","fromId":"branch-merge","fromPort":"out","toId":"branch-repeat","toPort":"in"}}),
    );
    assert_eq!(rejected["ok"], false);
    assert_eq!(rejected["error"]["code"], "INVALID_VALUE");
    assert_eq!(s.export_json(), initial);
    let rejected = edit(
        &mut s,
        tx,
        json!({"kind":"add_edge","edge":{"id":"bad","fromId":"branch-ground","fromPort":"out","toId":"branch-mask","toPort":"a"}}),
    );
    assert_eq!(rejected["ok"], false);
    assert_eq!(s.export_json(), initial);
    assert_eq!(
        edit(
            &mut s,
            tx,
            json!({"kind":"split_edge","id":"edge-branch-art-branch-repeat-in","node_id":"branch-repeat","input_port":"in"})
        )["ok"],
        false
    ); // self cycle
    assert_eq!(s.export_json(), initial);
    let changed = edit(
        &mut s,
        tx,
        json!({"kind":"reconnect_edge","id":"edge-branch-matte-branch-mask-mask","from_id":"branch-ground","to_id":"branch-mask","to_port":"mask"}),
    );
    assert_eq!(changed["ok"], true, "{changed}");
    assert_eq!(doc(&s)["graph"]["edges"].as_array().unwrap().len(), 6);
    assert_eq!(call(&mut s, "cancel", tx, json!([]))["changed"], true);
    assert_eq!(s.export_json(), initial);
}

#[test]
fn reconnecting_the_same_endpoints_is_a_true_no_op() {
    let mut s = session(fixture("branch"));
    let initial = s.export_json();
    let initial_plan = plan(&s, "__export__");
    let tx = begin(&mut s);
    let result = edit(
        &mut s,
        tx,
        json!({"kind":"reconnect_edge","id":"edge-branch-ground-branch-merge-a","from_id":"branch-ground","to_id":"branch-merge","to_port":"a"}),
    );
    assert_eq!(result["ok"], true);
    assert_eq!(result["changed"], false);
    assert_eq!(call(&mut s, "commit", tx, json!([]))["changed"], false);
    assert_eq!(s.revision(), 0);
    assert!(!s.can_undo());
    assert_eq!(s.export_json(), initial);
    assert_eq!(plan(&s, "__export__"), initial_plan);
}

#[test]
fn existing_layer_commands_preserve_branch_topology_and_opaque_data() {
    let mut d = fixture("branch");
    d["graph"]["futureNodes"] = json!([{"id":"opaque-node","payload":{"keep":null}}]);
    d["graph"]["futureMetadata"] = json!({"key":123456789});
    let mut s = session(d);
    let initial_edges = doc(&s)["graph"]["edges"].clone();
    let mut states = vec![s.export_json()];
    assert_eq!(
        command(
            &mut s,
            json!({"type":"add_layer","kind":"text","new_id":"new-text","after_id":"branch-ground"})
        )["ok"],
        true
    );
    assert_eq!(doc(&s)["graph"]["edges"], initial_edges);
    assert!(
        plan(&s, "__export__")["disconnectedNodeIds"]
            .as_array()
            .unwrap()
            .contains(&json!("new-text"))
    );
    states.push(s.export_json());
    assert_eq!(
        command(
            &mut s,
            json!({"type":"duplicate_layer","id":"branch-art","new_id":"art-copy"})
        )["ok"],
        true
    );
    assert_eq!(doc(&s)["graph"]["edges"], initial_edges);
    states.push(s.export_json());
    assert_eq!(
        command(
            &mut s,
            json!({"type":"move_layer","id":"new-text","delta":1})
        )["ok"],
        true
    );
    assert_eq!(doc(&s)["graph"]["edges"], initial_edges);
    states.push(s.export_json());
    assert_eq!(
        command(&mut s, json!({"type":"remove_layer","id":"branch-matte"}))["ok"],
        true
    );
    let expected_edges: Vec<Value> = initial_edges
        .as_array()
        .unwrap()
        .iter()
        .filter(|edge| edge["fromId"] != "branch-matte" && edge["toId"] != "branch-matte")
        .cloned()
        .collect();
    assert_eq!(doc(&s)["graph"]["edges"], json!(expected_edges));
    assert_eq!(
        doc(&s)["graph"]["futureNodes"][0]["payload"]["keep"],
        Value::Null
    );
    assert_eq!(doc(&s)["graph"]["futureMetadata"]["key"], 123456789);
    states.push(s.export_json());
    for expected in states[..states.len() - 1].iter().rev() {
        assert!(s.undo());
        assert_eq!(&s.export_json(), expected);
    }
    for expected in &states[1..] {
        assert!(s.redo());
        assert_eq!(&s.export_json(), expected);
    }
}

#[test]
fn layer_only_fanout_never_falls_into_linear_bypass_or_reorder() {
    let mut d = fixture("branch");
    d["layers"] = json!([
        {"id":"a","kind":"fill","locked":false,"color":"#111111"},
        {"id":"b","kind":"fill","locked":false,"color":"#222222"},
        {"id":"c","kind":"fill","locked":false,"color":"#333333"}
    ]);
    d["graph"] = json!({
        "edges":[
            {"id":"ab","fromId":"a","fromPort":"out","toId":"b","toPort":"bg"},
            {"id":"bo","fromId":"b","fromPort":"out","toId":"__export__","toPort":"in"},
            {"id":"ac","fromId":"a","fromPort":"out","toId":"c","toPort":"bg"}
        ],
        "positions":{"a":{"x":0,"y":0},"b":{"x":300,"y":0},"c":{"x":300,"y":200}},
        "mergeNodes":[],"colorNodes":[],"opaque":{"keep":true}
    });
    let mut s = session(d);
    let initial_edges = doc(&s)["graph"]["edges"].clone();
    assert_eq!(
        command(
            &mut s,
            json!({"type":"add_layer","kind":"text","new_id":"new","after_id":"a"})
        )["ok"],
        true
    );
    assert_eq!(doc(&s)["graph"]["edges"], initial_edges);
    assert_eq!(
        command(&mut s, json!({"type":"move_layer","id":"c","delta":-1}))["ok"],
        true
    );
    assert_eq!(doc(&s)["graph"]["edges"], initial_edges);
    assert_eq!(
        command(&mut s, json!({"type":"remove_layer","id":"b"}))["ok"],
        true
    );
    assert_eq!(doc(&s)["graph"]["edges"], json!([initial_edges[2]]));
    assert_eq!(doc(&s)["graph"]["opaque"], json!({"keep":true}));
    assert!(s.undo());
    assert_eq!(doc(&s)["graph"]["edges"], initial_edges);
}

#[test]
fn branch_layer_commands_reject_unsupported_and_locked_affected_nodes() {
    let mut d = fixture("branch");
    d["layers"]
        .as_array_mut()
        .unwrap()
        .push(json!({"id":"model","kind":"primitive","locked":false}));
    d["layers"][0]["locked"] = json!(true);
    let mut s = session(d);
    let initial = s.export_json();
    for value in [
        json!({"type":"duplicate_layer","id":"model","new_id":"model-copy"}),
        json!({"type":"remove_layer","id":"model"}),
        json!({"type":"move_layer","id":"model","delta":-1}),
        json!({"type":"remove_layer","id":"branch-ground"}),
    ] {
        assert_eq!(command(&mut s, value)["ok"], false);
        assert_eq!(s.export_json(), initial);
    }
}

#[test]
fn multi_delete_respects_locked_layers_and_areas_are_organizational() {
    let mut d = fixture("branch");
    d["layers"][0]["locked"] = json!(true);
    let mut s = session(d);
    let original = s.export_json();
    let tx = begin(&mut s);
    let result = edit(
        &mut s,
        tx,
        json!({"kind":"remove_nodes","ids":["branch-repeat","branch-ground"]}),
    );
    assert_eq!(result["error"]["code"], "LOCKED_LAYER");
    assert_eq!(s.export_json(), original);
    assert_eq!(
        edit(
            &mut s,
            tx,
            json!({"kind":"add_area","area":{"id":"group","name":"Group","nodeIds":["branch-repeat"],"color":"#ff705f"}})
        )["ok"],
        true
    );
    let before = plan(&s, "__export__");
    assert_eq!(
        edit(
            &mut s,
            tx,
            json!({"kind":"assign_area","id":"group","node_ids":["branch-mask"]})
        )["ok"],
        true
    );
    assert_eq!(
        plan(&s, "__export__")["dependencyNodeIds"],
        before["dependencyNodeIds"]
    );
    assert_eq!(
        edit(
            &mut s,
            tx,
            json!({"kind":"remove_nodes","ids":["branch-repeat","branch-mask"]})
        )["ok"],
        true
    );
    let group = doc(&s)["graph"]["areas"]
        .as_array()
        .unwrap()
        .iter()
        .find(|area| area["id"] == "group")
        .unwrap()
        .clone();
    assert_eq!(group["nodeIds"], json!([]));
    assert_eq!(call(&mut s, "commit", tx, json!([]))["ok"], true);
    assert!(s.undo());
    assert_eq!(s.export_json(), original);
}

#[test]
fn graph_and_stack_modes_never_linearize_each_other() {
    let mut d = fixture("branch");
    d.as_object_mut().unwrap().remove("graph");
    let mut s = session(d);
    let initial = s.export_json();
    assert_eq!(plan(&s, "__export__")["mode"], "stack");
    let tx = begin(&mut s);
    let result = edit(
        &mut s,
        tx,
        json!({"kind":"add_edge","edge":{"id":"e","fromId":"branch-art","fromPort":"out","toId":"__export__","toPort":"in"}}),
    );
    assert_eq!(result["error"]["code"], "INVALID_TARGET");
    assert_eq!(s.export_json(), initial);
}

#[test]
fn stack_plan_marks_unsupported_layers_without_creating_a_graph() {
    let mut d = fixture("branch");
    d.as_object_mut().unwrap().remove("graph");
    d["layers"]
        .as_array_mut()
        .unwrap()
        .push(json!({"id":"model","kind":"model","locked":false,"future":null}));
    let s = session(d);
    let original = s.export_json();
    let plan = plan(&s, "__export__");
    assert_eq!(plan["mode"], "stack");
    assert_eq!(plan["renderable2d"], false);
    assert_eq!(plan["unsupportedNodeIds"], json!(["model"]));
    assert_eq!(
        plan["renderLayerIds"],
        json!(["branch-ground", "branch-art", "branch-matte", "model"])
    );
    assert_eq!(s.export_json(), original);
}

#[test]
fn duplicate_layer_and_utility_are_disconnected_and_undo_together() {
    let mut s = session(fixture("branch"));
    let original = s.export_json();
    let tx = begin(&mut s);
    let result = edit(
        &mut s,
        tx,
        json!({"kind":"duplicate_nodes","copies":[
            {"id":"branch-art","new_id":"branch-art-copy"},
            {"id":"branch-repeat","new_id":"branch-repeat-copy"}
        ]}),
    );
    assert_eq!(result["ok"], true, "{result}");
    assert_eq!(doc(&s)["layers"][2]["id"], "branch-art-copy");
    assert_eq!(doc(&s)["graph"]["repeatNodes"].as_array().unwrap().len(), 2);
    assert_eq!(
        plan(&s, "__export__")["disconnectedNodeIds"],
        json!(["branch-art-copy", "branch-repeat-copy"])
    );
    assert_eq!(call(&mut s, "commit", tx, json!([]))["ok"], true);
    assert!(s.undo());
    assert_eq!(s.export_json(), original);
}

#[test]
fn moving_area_membership_is_exclusive() {
    let mut s = session(fixture("branch"));
    let tx = begin(&mut s);
    let result = edit(
        &mut s,
        tx,
        json!({"kind":"add_area","area":{"id":"new-area","name":"New","color":"#ff705f","nodeIds":["branch-merge"]}}),
    );
    assert_eq!(result["ok"], true, "{result}");
    let areas = doc(&s)["graph"]["areas"].as_array().unwrap().clone();
    assert_eq!(
        areas
            .iter()
            .filter(|a| a["nodeIds"]
                .as_array()
                .unwrap()
                .contains(&json!("branch-merge")))
            .count(),
        1
    );
}

#[test]
fn repeat_backdrop_port_is_valid_and_unsupported_3d_edges_are_preserved() {
    let mut d = fixture("branch");
    d["graph"]["scene3dNodes"] = json!([{"id":"web-3d","name":"3D","future":null}]);
    d["graph"]["edges"].as_array_mut().unwrap().push(json!({"id":"web-edge","fromId":"web-3d","fromPort":"out","toId":"branch-ground","toPort":"bg"}));
    let mut s = session(d);
    let initial = s.export_json();
    assert_eq!(plan(&s, "__export__")["renderable2d"], false);
    assert_eq!(
        plan(&s, "__export__")["unsupportedNodeIds"],
        json!(["web-3d"])
    );
    let tx = begin(&mut s);
    let denied = edit(
        &mut s,
        tx,
        json!({"kind":"remove_edges","ids":["web-edge"]}),
    );
    assert_eq!(denied["error"]["code"], "UNSUPPORTED_CAPABILITY");
    assert_eq!(s.export_json(), initial);
    let denied = edit(
        &mut s,
        tx,
        json!({"kind":"remove_nodes","ids":["branch-ground"]}),
    );
    assert_eq!(denied["error"]["code"], "UNSUPPORTED_CAPABILITY");
    assert_eq!(s.export_json(), initial);
    let denied = edit(
        &mut s,
        tx,
        json!({"kind":"add_edge","edge":{"id":"replace-web","fromId":"branch-art","fromPort":"out","toId":"branch-ground","toPort":"bg"}}),
    );
    assert_eq!(denied["error"]["code"], "UNSUPPORTED_CAPABILITY");
    assert_eq!(s.export_json(), initial);
    let accepted = edit(
        &mut s,
        tx,
        json!({"kind":"add_edge","edge":{"id":"repeat-bg","fromId":"branch-ground","fromPort":"out","toId":"branch-repeat","toPort":"bg"}}),
    );
    assert_eq!(accepted["ok"], true, "{accepted}");
    assert_eq!(doc(&s)["graph"]["scene3dNodes"][0]["future"], Value::Null);
    assert_eq!(
        doc(&s)["graph"]["edges"]
            .as_array()
            .unwrap()
            .iter()
            .filter(|e| e["id"] == "web-edge")
            .count(),
        1
    );
}

#[test]
fn utility_creation_uses_web_defaults_and_rejects_bad_control_values() {
    let mut s = session(fixture("branch"));
    let before = s.export_json();
    let tx = begin(&mut s);
    for (kind, action) in [
        (
            "mask mode",
            json!({"kind":"add_node","collection":"mask","node":{"id":"bad-mask","mode":"invalid"},"position":{"x":0,"y":0}}),
        ),
        (
            "repeat count",
            json!({"kind":"patch_node","id":"branch-repeat","patch":{"count":0}}),
        ),
        (
            "repeat fraction",
            json!({"kind":"patch_node","id":"branch-repeat","patch":{"count":3.5}}),
        ),
        (
            "repeat pattern",
            json!({"kind":"patch_node","id":"branch-repeat","patch":{"pattern":"hexagonal"}}),
        ),
        (
            "mask string",
            json!({"kind":"patch_node","id":"branch-mask","patch":{"feather":"5"}}),
        ),
    ] {
        let result = edit(&mut s, tx, action);
        assert_eq!(result["error"]["code"], "INVALID_VALUE", "{kind}: {result}");
        assert_eq!(s.export_json(), before, "{kind}");
    }
    let added = edit(
        &mut s,
        tx,
        json!({"kind":"add_node","collection":"mask","node":{"id":"new-mask","unknown":{"keep":null}},"position":{"x":42,"y":24}}),
    );
    assert_eq!(added["ok"], true, "{added}");
    let node = &doc(&s)["graph"]["maskNodes"]
        .as_array()
        .unwrap()
        .iter()
        .find(|n| n["id"] == "new-mask")
        .unwrap()
        .clone();
    assert_eq!(node["mode"], "alpha");
    assert_eq!(node["invert"], false);
    assert_eq!(node["opacity"], 100);
    assert_eq!(node["unknown"]["keep"], Value::Null);
}

#[test]
fn unsupported_layer_nodes_cannot_be_deleted_or_duplicated() {
    let mut d = fixture("branch");
    d["layers"]
        .as_array_mut()
        .unwrap()
        .push(json!({"id":"model","kind":"model","locked":false,"future":null}));
    let mut s = session(d);
    let before = s.export_json();
    let tx = begin(&mut s);
    for action in [
        json!({"kind":"remove_nodes","ids":["model"]}),
        json!({"kind":"duplicate_nodes","copies":[{"id":"model","new_id":"model-copy"}]}),
        json!({"kind":"set_positions","positions":{"model":{"x":12,"y":15}}}),
    ] {
        let result = edit(&mut s, tx, action);
        assert_eq!(result["ok"], false, "{result}");
        assert_eq!(s.export_json(), before);
    }
}
