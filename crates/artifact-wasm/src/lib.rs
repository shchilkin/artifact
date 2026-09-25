use artifact_core::DocumentSession;
use wasm_bindgen::prelude::*;

#[wasm_bindgen]
pub struct WebSession {
    inner: DocumentSession,
}

#[wasm_bindgen]
impl WebSession {
    #[wasm_bindgen(constructor)]
    pub fn new(source: &str) -> Result<WebSession, JsError> {
        Ok(Self {
            inner: DocumentSession::open(source)?,
        })
    }

    pub fn export_json(&self) -> String {
        self.inner.export_json()
    }
    pub fn export_durable_json(&self) -> Result<String, JsError> {
        Ok(self.inner.export_durable_json()?)
    }
    pub fn revision(&self) -> u64 {
        self.inner.revision()
    }
    pub fn begin_transaction_json(&mut self, request: &str) -> String {
        self.inner.begin_transaction_json(request)
    }
    pub fn update_transaction_json(&mut self, request: &str) -> String {
        self.inner.update_transaction_json(request)
    }
    pub fn commit_transaction_json(&mut self, request: &str) -> String {
        self.inner.commit_transaction_json(request)
    }
    pub fn cancel_transaction_json(&mut self, request: &str) -> String {
        self.inner.cancel_transaction_json(request)
    }
    pub fn render_plan_json(&self, width: u32, height: u32) -> Result<String, JsError> {
        Ok(self.inner.render_plan_json(width, height)?)
    }
    pub fn render_target_plan_json(
        &self,
        width: u32,
        height: u32,
        target_id: &str,
    ) -> Result<String, JsError> {
        Ok(self
            .inner
            .render_target_plan_json(width, height, target_id)?)
    }
    pub fn graph_plan_json(&self, target_id: &str) -> Result<String, JsError> {
        Ok(self.inner.graph_plan_json(target_id)?)
    }
    pub fn summary_json(&self) -> String {
        self.inner.summary_json()
    }

    pub fn set_scanlines(&mut self, layer_id: &str, amount: f64) -> Result<bool, JsError> {
        Ok(self.inner.set_scanlines(layer_id, amount)?)
    }

    pub fn set_text(&mut self, layer_id: &str, patch_json: &str) -> Result<bool, JsError> {
        Ok(self.inner.set_text(layer_id, patch_json)?)
    }

    pub fn set_image(&mut self, layer_id: &str, patch_json: &str) -> Result<bool, JsError> {
        Ok(self.inner.set_image(layer_id, patch_json)?)
    }

    pub fn execute(&mut self, command_json: &str) -> Result<bool, JsError> {
        Ok(self.inner.execute(command_json)?)
    }
    pub fn editor_state_json(&self) -> String {
        self.inner.editor_state_json()
    }

    pub fn undo(&mut self) -> bool {
        self.inner.undo()
    }
    pub fn redo(&mut self) -> bool {
        self.inner.redo()
    }
}

#[wasm_bindgen]
pub fn render_effect(
    pixels: Vec<u8>,
    width: u32,
    height: u32,
    layer_json: &str,
    seed: u32,
) -> Result<Vec<u8>, JsError> {
    Ok(artifact_core::render::effect_rgba(
        pixels, width, height, layer_json, seed,
    )?)
}

#[wasm_bindgen]
pub fn new_project() -> String {
    DocumentSession::blank_json()
}

#[wasm_bindgen]
pub fn patch_layer(layer_json: &str, patch_json: &str) -> Result<String, JsError> {
    Ok(DocumentSession::patch_layer_json(layer_json, patch_json)?)
}
