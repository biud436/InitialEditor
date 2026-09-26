// 에디터 설정 파일. 앱 설정 폴더(app_config_dir)의 settings.json 하나다.
// 내용의 해석은 프런트(core 의 SettingsStore)가 하고, 여기는 JSON 문자열을 그대로 읽고 원자적으로 쓸 뿐이다.

use std::fs;
use std::path::Path;

use crate::error::{BackendError, ErrorCode, Result};
use crate::fsutil::write_atomic;

pub const FILE_NAME: &str = "settings.json";

/// 파일이 없으면 None
pub fn load(dir: &Path) -> Result<Option<String>> {
    match fs::read(dir.join(FILE_NAME)) {
        Ok(bytes) => Ok(Some(String::from_utf8_lossy(&bytes).into_owned())),
        Err(e) if e.kind() == std::io::ErrorKind::NotFound => Ok(None),
        Err(e) => Err(BackendError::io(&e, Some(FILE_NAME))),
    }
}

/// JSON 인지 확인한 뒤 원자적으로 쓴다 (폴더가 없으면 만든다)
pub fn save(dir: &Path, json: &str) -> Result<()> {
    serde_json::from_str::<serde_json::Value>(json)
        .map_err(|e| BackendError::new(ErrorCode::Io, format!("설정이 JSON 이 아니다: {e}")))?;
    fs::create_dir_all(dir).map_err(|e| BackendError::io(&e, Some(&dir.to_string_lossy())))?;
    write_atomic(&dir.join(FILE_NAME), json.as_bytes())
        .map_err(|e| BackendError::io(&e, Some(FILE_NAME)))
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn round_trip_in_temp_dir() {
        let dir = tempfile::tempdir().unwrap();
        let config = dir.path().join("InitialEditor");
        assert_eq!(load(&config).unwrap(), None);
        let json = r#"{"theme":"dark","recentProjects":["/Users/u/Initial2D"],"한글":"값"}"#;
        save(&config, json).unwrap();
        assert_eq!(load(&config).unwrap().as_deref(), Some(json));
        save(&config, "{}").unwrap();
        assert_eq!(load(&config).unwrap().as_deref(), Some("{}"));
        let names: Vec<String> = fs::read_dir(&config)
            .unwrap()
            .map(|e| e.unwrap().file_name().to_string_lossy().into_owned())
            .collect();
        assert_eq!(names, vec![FILE_NAME.to_string()]);
    }

    #[test]
    fn rejects_non_json() {
        let dir = tempfile::tempdir().unwrap();
        assert_eq!(
            save(dir.path(), "not json").unwrap_err().code,
            ErrorCode::Io
        );
        assert!(!dir.path().join(FILE_NAME).exists());
    }
}
