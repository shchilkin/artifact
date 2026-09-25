//! Shared property validation registry. New source/effect families add a bounded
//! validator here rather than expanding the command or history dispatcher.
use serde_json::Value;

fn number(value: &Value, low: f64, high: f64) -> bool {
    value
        .as_f64()
        .is_some_and(|n| n.is_finite() && (low..=high).contains(&n))
}
fn color(value: &Value) -> bool {
    value.as_str().is_some_and(|s| {
        s.len() == 7 && s.starts_with('#') && s[1..].bytes().all(|b| b.is_ascii_hexdigit())
    })
}
fn shared(kind: &str, key: &str, value: &Value) -> Option<bool> {
    match key {
        "name" => Some(value.as_str().is_some_and(|s| !s.contains('\0'))),
        "visible" | "locked" => Some(value.is_boolean()),
        "opacity" if kind != "effect" => Some(number(value, 0.0, 100.0)),
        _ => None,
    }
}
fn transform(key: &str, value: &Value) -> Option<bool> {
    match key {
        "x" | "y" => Some(number(value, -2.0, 3.0)),
        "scaleX" | "scaleY" => Some(number(value, 0.01, 10.0)),
        "rotation" => Some(number(value, -360.0, 360.0)),
        _ => None,
    }
}
fn text(_doc: &Value, key: &str, value: &Value) -> Option<bool> {
    match key {
        "content" => Some(value.as_str().is_some_and(|s| !s.contains('\0'))),
        "size" => Some(number(value, 1.0, 540.0)),
        "color" => Some(color(value)),
        "align" => Some(
            value
                .as_str()
                .is_some_and(|s| ["left", "center", "right"].contains(&s)),
        ),
        "font" => Some(value.as_str().is_some_and(|font| {
            // Keep this list aligned with apps/web/app/types/typography.ts FONT_REGISTRY.
            const BUNDLED: &[&str] = &[
                "MONO",
                "DISPLAY",
                "ANTON",
                "BEBAS",
                "RUBIK_MONO",
                "VT323",
                "SPECIAL",
                "ARCHIVO_BLACK",
                "BUNGEE",
                "STAATLICHES",
                "SPACE_MONO",
                "PRESS_START",
            ];
            BUNDLED.contains(&font)
                || font.strip_prefix("artifact-font://").is_some_and(|id| {
                    !id.is_empty() && id.len() <= 200 && !id.contains('\0') && !id.contains('/')
                })
        })),
        _ => transform(key, value),
    }
}
fn image(key: &str, value: &Value) -> Option<bool> {
    match key {
        "src" => Some(crate::image::validate_source(value).is_ok()),
        "fit" => Some(
            value
                .as_str()
                .is_some_and(|s| ["free", "cover", "contain", "tile"].contains(&s)),
        ),
        _ => transform(key, value),
    }
}
fn emoji(key: &str, value: &Value) -> Option<bool> {
    match key {
        "emojis" => Some(value.as_array().is_some_and(|values| {
            !values.is_empty()
                && values.len() <= 100
                && values
                    .iter()
                    .all(|v| v.as_str().is_some_and(|s| !s.is_empty() && s.len() <= 64))
        })),
        "density" => Some(number(value, 0.0, 1000.0)),
        "minSz" | "maxSz" => Some(number(value, 1.0, 540.0)),
        "seedOffset" => Some(number(value, -999.0, 999.0)),
        _ => None,
    }
}
fn effect(key: &str, value: &Value) -> Option<bool> {
    const PERCENT: &[&str] = &[
        "glitch",
        "grain",
        "noiseWarp",
        "vortex",
        "tearAmt",
        "scanlines",
        "ca",
    ];
    match key {
        "tearSize" | "scanlineWidth" => Some(number(value, 0.01, 100.0)),
        key if PERCENT.contains(&key) => Some(number(value, 0.0, 100.0)),
        _ => None,
    }
}

fn classify(doc: &Value, kind: &str, key: &str, value: &Value) -> Option<bool> {
    shared(kind, key, value).or_else(|| match kind {
        "text" => text(doc, key, value),
        "image" => image(key, value),
        "fill" if key == "color" => Some(color(value)),
        "emoji" => emoji(key, value),
        "effect" => effect(key, value),
        _ => None,
    })
}

pub(crate) fn is_shared_key(doc: &Value, kind: &str, key: &str) -> bool {
    classify(doc, kind, key, &Value::Null).is_some()
}

pub(crate) fn validate(doc: &Value, kind: &str, key: &str, value: &Value) -> bool {
    classify(doc, kind, key, value).unwrap_or(false)
}
