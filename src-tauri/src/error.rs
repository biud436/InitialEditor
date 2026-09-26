// 프런트의 BackendError 와 같은 모양으로 직렬화되는 오류 (packages/core/src/backend.ts).
// 명령이 Err 를 돌려주면 JS 는 `{ code, message, path? }` 객체를 받아 BackendError 로 되만든다.

use serde::Serialize;

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize)]
#[serde(rename_all = "snake_case")]
pub enum ErrorCode {
    NotFound,
    OutsideRoot,
    NotOpen,
    Io,
    Unsupported,
    HmrUnreachable,
    EngineNotFound,
    Network,
}

#[derive(Debug, Clone, Serialize, thiserror::Error)]
#[serde(rename_all = "camelCase")]
#[error("{message}")]
pub struct BackendError {
    pub code: ErrorCode,
    pub message: String,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub path: Option<String>,
}

pub type Result<T> = std::result::Result<T, BackendError>;

impl BackendError {
    pub fn new(code: ErrorCode, message: impl Into<String>) -> Self {
        Self {
            code,
            message: message.into(),
            path: None,
        }
    }

    pub fn with_path(code: ErrorCode, message: impl Into<String>, path: impl Into<String>) -> Self {
        Self {
            code,
            message: message.into(),
            path: Some(path.into()),
        }
    }

    pub fn not_found(path: impl Into<String>) -> Self {
        let path = path.into();
        Self::with_path(ErrorCode::NotFound, format!("없다: {path}"), path)
    }

    pub fn outside_root(path: impl Into<String>) -> Self {
        let path = path.into();
        Self::with_path(
            ErrorCode::OutsideRoot,
            format!("프로젝트 루트 밖이다: {path}"),
            path,
        )
    }

    pub fn not_open() -> Self {
        Self::new(ErrorCode::NotOpen, "프로젝트가 열려 있지 않다")
    }

    /// std::io::Error 를 옮긴다. NotFound 는 not_found 로, 나머지는 io 로.
    pub fn io(err: &std::io::Error, path: Option<&str>) -> Self {
        if err.kind() == std::io::ErrorKind::NotFound {
            if let Some(p) = path {
                return Self::not_found(p);
            }
        }
        Self {
            code: ErrorCode::Io,
            message: match path {
                Some(p) => format!("{p}: {err}"),
                None => err.to_string(),
            },
            path: path.map(str::to_string),
        }
    }
}
