use artifact_core::DocumentSession;
use serde_json::json;
use std::{env, fs};

fn main() -> Result<(), Box<dyn std::error::Error>> {
    let args: Vec<String> = env::args().collect();
    if !(4..=6).contains(&args.len()) {
        return Err("usage: conformance INPUT LAYER_ID OUTPUT [PATCH_FILE] [image]".into());
    }
    let mut session = DocumentSession::open(&fs::read_to_string(&args[1])?)?;
    let opened = session.export_json();
    let mut steps = 1;
    if args.len() == 6 && args[5] == "editor" {
        let commands: Vec<serde_json::Value> =
            serde_json::from_str(&fs::read_to_string(&args[4])?)?;
        steps = 0;
        for command in commands {
            if session.execute(&command.to_string())? {
                steps += 1;
            }
        }
    } else if args.len() == 6 && args[5] == "image" {
        session.set_image(&args[2], &fs::read_to_string(&args[4])?)?;
    } else if args.len() == 5 {
        session.set_text(&args[2], &fs::read_to_string(&args[4])?)?;
    } else {
        session.set_scanlines(&args[2], 50.0)?;
    }
    let changed = session.export_json();
    for _ in 0..steps {
        assert!(session.undo());
    }
    let undone = session.export_json();
    for _ in 0..steps {
        assert!(session.redo());
    }
    let redone = session.export_json();
    let reopened = DocumentSession::open(&redone)?.export_json();
    fs::write(&args[3], json!({"opened": opened, "changed": changed, "undone": undone, "redone": redone, "reopened": reopened}).to_string())?;
    println!("Native Rust command sequence complete");
    Ok(())
}
