// 앱에 든 엔진 (docs/plans/e6-packaging.md 2.2 절). 릴리스 빌드의 tauri.sidecar.conf.json 이 externalBin 으로
// 메인 실행 파일 옆에 Initial2D 를, bundle.resources 로 engine/engine.json 을 놓는다. 여기는 두 파일을 찾기만 하고
// 실행하지 않는다 (--features 는 프런트가 engine_features 로 부른다).

use std::path::Path;

use serde::{Deserialize, Serialize};

/// 사이드카의 설치된 이름 (Tauri 가 `-<타깃 트리플>` 을 떼고 놓는다)
pub const SIDECAR_NAME: &str = if cfg!(windows) {
    "Initial2D.exe"
} else {
    "Initial2D"
};
/// 번들 리소스 안의 판 정보 (scripts/fetch-engine.mjs 가 src-tauri/binaries/engine.json 으로 쓴다)
pub const META_PATH: &str = "engine/engine.json";

/// engine.json 가운데 앱이 쓰는 칸. 나머지 칸은 무시한다
#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct EngineMeta {
    /// v2 이상의 엔진 태그. 태그 없는 커밋에서 만든 엔진이면 null
    pub engine_tag: Option<String>,
    /// 엔진 커밋 40자
    pub engine_commit: String,
    /// `git describe` (태그가 없으면 짧은 커밋)
    #[serde(default)]
    pub describe: Option<String>,
    pub target: String,
    pub sha256: String,
    pub features: Vec<String>,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct BundledEngine {
    /// 실행 파일의 절대 경로
    pub path: String,
    /// engine.json 이 없거나 읽지 못했으면 null (엔진은 그래도 쓴다)
    pub meta: Option<EngineMeta>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub meta_error: Option<String>,
}

/// exe_dir 에 사이드카가 있으면 그 경로와 resource_dir 의 engine.json. 사이드카가 없으면 None
pub fn find(exe_dir: &Path, resource_dir: Option<&Path>) -> Option<BundledEngine> {
    let exe = exe_dir.join(SIDECAR_NAME);
    if !exe.is_file() {
        return None;
    }
    let (meta, meta_error) = match resource_dir {
        None => (None, Some("리소스 폴더를 모른다".to_string())),
        Some(dir) => match read_meta(&dir.join(META_PATH)) {
            Ok(meta) => (Some(meta), None),
            Err(e) => (None, Some(e)),
        },
    };
    Some(BundledEngine {
        path: exe.to_string_lossy().into_owned(),
        meta,
        meta_error,
    })
}

fn read_meta(path: &Path) -> std::result::Result<EngineMeta, String> {
    let text = std::fs::read_to_string(path).map_err(|e| format!("{}: {e}", path.display()))?;
    serde_json::from_str(&text).map_err(|e| format!("{}: {e}", path.display()))
}

#[cfg(test)]
mod tests {
    use super::*;

    const META: &str = r#"{
      "comment": "scripts/fetch-engine.mjs 가 쓴다",
      "engineTag": null,
      "engineCommit": "cac4b94e2dab79e13e5fd2ebdb6686fd23cfd33f",
      "describe": "cac4b94",
      "target": "aarch64-apple-darwin",
      "sha256": "c02a0540882e1d76316b75891c2cfb7c828ba38be3b08f8c3d0a90646d0d43d0",
      "size": 3432688,
      "features": ["lua", "mruby"]
    }"#;

    fn layout(with_exe: bool, meta: Option<&str>) -> tempfile::TempDir {
        let dir = tempfile::tempdir().unwrap();
        if with_exe {
            std::fs::write(dir.path().join(SIDECAR_NAME), b"engine").unwrap();
        }
        if let Some(text) = meta {
            std::fs::create_dir_all(dir.path().join("engine")).unwrap();
            std::fs::write(dir.path().join(META_PATH), text).unwrap();
        }
        dir
    }

    #[test]
    fn finds_sidecar_and_reads_meta() {
        let dir = layout(true, Some(META));
        let found = find(dir.path(), Some(dir.path())).unwrap();
        assert_eq!(found.path, dir.path().join(SIDECAR_NAME).to_string_lossy());
        assert_eq!(found.meta_error, None);
        let meta = found.meta.unwrap();
        assert_eq!(meta.engine_tag, None);
        assert_eq!(
            meta.engine_commit,
            "cac4b94e2dab79e13e5fd2ebdb6686fd23cfd33f"
        );
        assert_eq!(meta.describe.as_deref(), Some("cac4b94"));
        assert_eq!(meta.target, "aarch64-apple-darwin");
        assert_eq!(meta.features, vec!["lua".to_string(), "mruby".to_string()]);
    }

    #[test]
    fn no_sidecar_means_none() {
        let dir = layout(false, Some(META));
        assert_eq!(find(dir.path(), Some(dir.path())), None);
        // 같은 이름의 폴더는 실행 파일이 아니다
        std::fs::create_dir_all(dir.path().join(SIDECAR_NAME)).unwrap();
        assert_eq!(find(dir.path(), Some(dir.path())), None);
    }

    #[test]
    fn missing_or_broken_meta_keeps_the_engine() {
        let missing = layout(true, None);
        let found = find(missing.path(), Some(missing.path())).unwrap();
        assert_eq!(found.meta, None);
        assert!(found.meta_error.unwrap().contains("engine.json"));

        let broken = layout(true, Some("{ not json"));
        let found = find(broken.path(), Some(broken.path())).unwrap();
        assert_eq!(found.meta, None);
        assert!(found.meta_error.is_some());

        let wrong_shape = layout(true, Some(r#"{ "engineCommit": 1 }"#));
        let found = find(wrong_shape.path(), Some(wrong_shape.path())).unwrap();
        assert_eq!(found.meta, None);
        assert!(found.meta_error.is_some());

        let no_resources = layout(true, Some(META));
        let found = find(no_resources.path(), None).unwrap();
        assert_eq!(found.meta, None);
        assert!(found.meta_error.is_some());
    }

    #[test]
    fn serializes_camel_case_without_empty_error() {
        let dir = layout(true, Some(META));
        let json = serde_json::to_value(find(dir.path(), Some(dir.path())).unwrap()).unwrap();
        assert_eq!(
            json["meta"]["engineCommit"],
            "cac4b94e2dab79e13e5fd2ebdb6686fd23cfd33f"
        );
        assert_eq!(json["meta"]["engineTag"], serde_json::Value::Null);
        assert!(json.get("metaError").is_none());
    }
}
