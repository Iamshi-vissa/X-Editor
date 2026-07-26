// Documents model 
use serde::{Deserialize, Serialize};

#[derive(Debug, Serialize, Deserialize, Clone)]
pub struct Document {
    pub id: String,
    pub path: String,
    pub language: String,
    pub content: String,
    pub version: u32,
    pub is_dirty: bool,
    pub encoding: String,
}
