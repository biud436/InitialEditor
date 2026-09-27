// 상대 경로 규칙 (docs/plans/03-project-and-runtime.md 2절). 검사는 두 겹이다.
//   1. normalize_rel: 역슬래시를 `/` 로 바꾸고, 절대 경로와 `..` 탈출을 거부한다 (core 의 paths.ts 와 같은 규칙)
//   2. resolve: 루트에 붙인 뒤, 존재하는 가장 가까운 조상을 canonicalize 해 루트 안인지 다시 본다 (심링크 탈출 거부)
// 프런트가 이미 정규화했더라도 믿지 않고 여기서 다시 검사한다.

use std::path::{Path, PathBuf};
use std::time::Duration;

use crate::error::{BackendError, Result};

/// 바꿔 치우는(원자적 쓰기의 rename) 순간의 파일을 canonicalize 하면 Windows 는 지워진 옛 파일의 자리
/// (`\\?\C:\$Extend\$Deleted\...`)나 접근 거부를 돌려줄 수 있다. 루트 밖이나 거부로 나오면 이만큼 다시 본다.
/// 다른 OS 의 realpath 는 경로로 풀어 이런 순간이 없다
const REPLACE_RACE_RETRIES: u32 = if cfg!(windows) { 20 } else { 0 };
const REPLACE_RACE_WAIT: Duration = Duration::from_millis(5);

/// "./a//b/../c\\d" → "a/c/d". 루트는 "". 절대 경로(`/x`, `C:\x`)와 루트 밖(`../x`)은 outside_root.
pub fn normalize_rel(input: &str) -> Result<String> {
    if input.contains('\0') {
        return Err(BackendError::outside_root(input));
    }
    let raw = input.replace('\\', "/");
    let bytes = raw.as_bytes();
    let has_drive = bytes.len() >= 2 && bytes[0].is_ascii_alphabetic() && bytes[1] == b':';
    // "/" 하나만 루트로 본다. 그 밖의 절대 경로는 실수로 넘어온 OS 경로다.
    if has_drive || (raw.starts_with('/') && raw != "/") {
        return Err(BackendError::outside_root(input));
    }
    let mut parts: Vec<&str> = Vec::new();
    for seg in raw.split('/') {
        match seg {
            "" | "." => continue,
            ".." => {
                if parts.pop().is_none() {
                    return Err(BackendError::outside_root(input));
                }
            }
            s => parts.push(s),
        }
    }
    Ok(parts.join("/"))
}

/// 상대 경로를 정규화하고 루트에 붙인다. `root` 는 canonicalize 된 경로여야 한다.
/// 돌려주는 절대 경로는 심링크를 풀지 않은 것이다 (삭제나 이름 바꾸기가 링크 자체를 다루게).
pub fn resolve(root: &Path, rel: &str) -> Result<(String, PathBuf)> {
    let norm = normalize_rel(rel)?;
    let abs = if norm.is_empty() {
        root.to_path_buf()
    } else {
        root.join(&norm)
    };
    assert_inside_root(root, &abs, rel)?;
    Ok((norm, abs))
}

/// 존재하는 가장 가까운 조상까지 realpath 를 구해 루트 안인지 본다 (브리지 서버의 assertInsideRoot 와 같다).
fn assert_inside_root(root: &Path, abs: &Path, rel: &str) -> Result<()> {
    let mut probe = abs.to_path_buf();
    let mut retries = REPLACE_RACE_RETRIES;
    loop {
        let found = std::fs::canonicalize(&probe);
        let settled = match &found {
            Ok(real) => real == root || real.starts_with(root),
            Err(e) => e.kind() != std::io::ErrorKind::PermissionDenied,
        };
        if !settled && retries > 0 {
            retries -= 1;
            std::thread::sleep(REPLACE_RACE_WAIT);
            continue;
        }
        match found {
            Ok(real) => {
                return if real == root || real.starts_with(root) {
                    Ok(())
                } else {
                    Err(BackendError::outside_root(rel))
                };
            }
            Err(e) if e.kind() == std::io::ErrorKind::PermissionDenied => {
                return Err(BackendError::io(&e, Some(rel)));
            }
            Err(_) => match probe.parent() {
                Some(p) => probe = p.to_path_buf(),
                None => return Ok(()),
            },
        }
    }
}

/// 정규화된 상대 경로의 부모. 최상위면 "".
pub fn parent_rel(rel: &str) -> &str {
    match rel.rfind('/') {
        Some(i) => &rel[..i],
        None => "",
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::error::ErrorCode;

    #[test]
    fn normalizes_like_core() {
        assert_eq!(normalize_rel("").unwrap(), "");
        assert_eq!(normalize_rel("/").unwrap(), "");
        assert_eq!(normalize_rel("./a//b/../c\\d").unwrap(), "a/c/d");
        assert_eq!(normalize_rel("scripts/lua/").unwrap(), "scripts/lua");
        assert_eq!(normalize_rel("a/./b").unwrap(), "a/b");
    }

    #[test]
    fn rejects_escapes_and_absolute_paths() {
        for bad in [
            "../x.lua",
            "scripts/../../x.lua",
            "..",
            "/etc/passwd",
            "C:\\Windows\\x",
            "a\\..\\..\\x",
            "a\0b",
        ] {
            let err = normalize_rel(bad).unwrap_err();
            assert_eq!(err.code, ErrorCode::OutsideRoot, "{bad}");
            assert_eq!(err.path.as_deref(), Some(bad));
        }
    }

    #[test]
    fn parent_of_rel() {
        assert_eq!(parent_rel("a/b/c"), "a/b");
        assert_eq!(parent_rel("a"), "");
        assert_eq!(parent_rel(""), "");
    }
}
