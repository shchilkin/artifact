use artifact_core::DocumentSession;
use std::sync::{Arc, Mutex, MutexGuard};

uniffi::setup_scaffolding!();

#[derive(Debug, thiserror::Error, uniffi::Error)]
pub enum SessionError {
    #[error("{message}")]
    Invalid { message: String },
}

impl From<artifact_core::CoreError> for SessionError {
    fn from(error: artifact_core::CoreError) -> Self {
        Self::Invalid {
            message: error.to_string(),
        }
    }
}

#[derive(uniffi::Object)]
pub struct NativeSession {
    inner: Mutex<DocumentSession>,
}

impl NativeSession {
    fn lock(&self) -> Result<MutexGuard<'_, DocumentSession>, SessionError> {
        self.inner.lock().map_err(|_| SessionError::Invalid {
            message: "Document session is unavailable; reopen the saved project".to_owned(),
        })
    }
}

#[uniffi::export]
impl NativeSession {
    #[uniffi::constructor]
    pub fn open(source: String) -> Result<Arc<Self>, SessionError> {
        Ok(Arc::new(Self {
            inner: Mutex::new(DocumentSession::open(&source)?),
        }))
    }

    pub fn export_json(&self) -> Result<String, SessionError> {
        Ok(self.lock()?.export_json())
    }

    pub fn render_plan_json(&self, width: u32, height: u32) -> Result<String, SessionError> {
        Ok(self.lock()?.render_plan_json(width, height)?)
    }

    pub fn summary_json(&self) -> Result<String, SessionError> {
        Ok(self.lock()?.summary_json())
    }

    pub fn set_scanlines(&self, layer_id: String, amount: f64) -> Result<bool, SessionError> {
        Ok(self.lock()?.set_scanlines(&layer_id, amount)?)
    }

    pub fn set_text(&self, layer_id: String, patch_json: String) -> Result<bool, SessionError> {
        Ok(self.lock()?.set_text(&layer_id, &patch_json)?)
    }

    pub fn set_image(&self, layer_id: String, patch_json: String) -> Result<bool, SessionError> {
        Ok(self.lock()?.set_image(&layer_id, &patch_json)?)
    }

    pub fn execute(&self, command_json: String) -> Result<bool, SessionError> {
        Ok(self.lock()?.execute(&command_json)?)
    }
    pub fn editor_state_json(&self) -> Result<String, SessionError> {
        Ok(self.lock()?.editor_state_json())
    }

    pub fn draft_plan_json(
        &self,
        layer_id: String,
        patch_json: String,
        size: u32,
    ) -> Result<String, SessionError> {
        Ok(self.lock()?.draft_plan_json(&layer_id, &patch_json, size)?)
    }
    pub fn undo(&self) -> Result<bool, SessionError> {
        Ok(self.lock()?.undo())
    }
    pub fn redo(&self) -> Result<bool, SessionError> {
        Ok(self.lock()?.redo())
    }
}

#[uniffi::export]
pub fn render_effect(
    pixels: Vec<u8>,
    width: u32,
    height: u32,
    layer_json: String,
    seed: u32,
) -> Result<Vec<u8>, SessionError> {
    Ok(artifact_core::render::effect_rgba(
        pixels,
        width,
        height,
        &layer_json,
        seed,
    )?)
}

#[uniffi::export]
pub fn new_project() -> String {
    DocumentSession::blank_json()
}
