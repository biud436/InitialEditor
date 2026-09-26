// 열린 프로젝트의 파일 접근: 한 층 목록, 읽기, 원자적 쓰기, 폴더 만들기, 삭제, 이름 바꾸기, 존재 확인.
// 모든 경로는 루트 기준 상대 경로이고 paths::resolve 가 두 겹으로 검사한다.
//
// 여기서 만든 변경은 RecentWrites 에 "이 경로는 곧 이런 상태가 된다" 로 기록한다. 감시(watcher.rs)가
// 이벤트를 받으면 그 기록과 실제 파일을 대조해 self(에디터가 쓴 것)와 external(밖에서 바뀐 것)을 가른다.
// 브리지 서버(tools/bridge/server.js)의 recentWrites 와 같은 발상이다.

use std::collections::HashMap;
use std::fs;
use std::path::{Path, PathBuf};
use std::sync::{Arc, Mutex};
use std::time::{Duration, Instant, UNIX_EPOCH};

use serde::Serialize;

use crate::error::{BackendError, ErrorCode, Result};
use crate::fsutil::{hash_bytes, lock, write_atomic};
use crate::paths::{parent_rel, resolve};

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ProjectInfo {
    pub root: String,
    pub name: String,
    pub has_game_json: bool,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize)]
#[serde(rename_all = "lowercase")]
pub enum EntryKind {
    File,
    Dir,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct Entry {
    pub name: String,
    pub path: String,
    pub kind: EntryKind,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub size: Option<u64>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub mtime: Option<u64>,
}

/// 이 프로세스가 방금 만든 변경 뒤에 그 경로가 어떤 상태여야 하는가
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum Expected {
    /// 이 내용의 파일. created 는 쓰기 전에 없던 파일이었는가
    Content {
        hash: u64,
        created: bool,
    },
    Dir,
    Gone,
}

/// 이 시간 안에 온 감시 이벤트만 self 후보로 본다 (브리지 서버와 같은 3초)
pub const SELF_WRITE_WINDOW: Duration = Duration::from_secs(3);

#[derive(Debug, Default)]
pub struct RecentWrites {
    map: HashMap<String, (Instant, Expected)>,
}

impl RecentWrites {
    pub fn remember(&mut self, rel: &str, expected: Expected) {
        self.map.insert(rel.to_string(), (Instant::now(), expected));
    }

    /// 창 안의 기록만 돌려준다. 오래된 기록은 지운다.
    pub fn get(&mut self, rel: &str) -> Option<Expected> {
        match self.map.get(rel) {
            Some((at, expected)) if at.elapsed() <= SELF_WRITE_WINDOW => Some(*expected),
            Some(_) => {
                self.map.remove(rel);
                None
            }
            None => None,
        }
    }

    pub fn forget(&mut self, rel: &str) {
        self.map.remove(rel);
    }

    pub fn len(&self) -> usize {
        self.map.len()
    }

    pub fn is_empty(&self) -> bool {
        self.map.is_empty()
    }
}

#[derive(Debug)]
pub struct ProjectFs {
    root: PathBuf,
    recent: Arc<Mutex<RecentWrites>>,
}

impl ProjectFs {
    /// 폴더여야 한다. 루트는 canonicalize 해 둔다 (심링크 검사의 기준).
    pub fn open(path: &str) -> Result<Self> {
        let root = fs::canonicalize(path).map_err(|e| BackendError::io(&e, Some(path)))?;
        if !root.is_dir() {
            return Err(BackendError::with_path(
                ErrorCode::NotFound,
                format!("폴더가 아니다: {path}"),
                path,
            ));
        }
        Ok(Self {
            root,
            recent: Arc::default(),
        })
    }

    pub fn root(&self) -> &Path {
        &self.root
    }

    pub fn recent(&self) -> Arc<Mutex<RecentWrites>> {
        Arc::clone(&self.recent)
    }

    pub fn info(&self) -> ProjectInfo {
        let name = self
            .root
            .file_name()
            .map(|n| n.to_string_lossy().into_owned())
            .unwrap_or_else(|| self.root.to_string_lossy().into_owned());
        ProjectInfo {
            root: self.root.to_string_lossy().into_owned(),
            name,
            has_game_json: self.root.join("game.json").is_file(),
        }
    }

    fn resolve(&self, rel: &str) -> Result<(String, PathBuf)> {
        resolve(&self.root, rel)
    }

    fn remember(&self, rel: &str, expected: Expected) {
        lock(&self.recent).remember(rel, expected);
    }

    /// `rel` 의 조상 중 아직 없는 폴더를 Dir 로 기록한다 (create_dir_all 이 만들 것들)
    fn remember_missing_dirs(&self, rel: &str) {
        let mut dir = parent_rel(rel);
        while !dir.is_empty() && !self.root.join(dir).exists() {
            self.remember(dir, Expected::Dir);
            dir = parent_rel(dir);
        }
    }

    /// 폴더 한 층. 정렬은 호출자가 한다.
    pub fn list(&self, rel: &str) -> Result<Vec<Entry>> {
        let (norm, abs) = self.resolve(rel)?;
        let read_dir = fs::read_dir(&abs).map_err(|e| match e.kind() {
            std::io::ErrorKind::NotFound | std::io::ErrorKind::NotADirectory => {
                BackendError::not_found(&norm)
            }
            _ => BackendError::io(&e, Some(&norm)),
        })?;
        let mut out = Vec::new();
        for entry in read_dir {
            let entry = entry.map_err(|e| BackendError::io(&e, Some(&norm)))?;
            let name = entry.file_name().to_string_lossy().into_owned();
            // 심링크는 가리키는 것의 종류로 (끊긴 링크는 파일로)
            let meta = match fs::metadata(entry.path()).or_else(|_| entry.metadata()) {
                Ok(m) => m,
                Err(_) => continue,
            };
            let path = if norm.is_empty() {
                name.clone()
            } else {
                format!("{norm}/{name}")
            };
            let kind = if meta.is_dir() {
                EntryKind::Dir
            } else {
                EntryKind::File
            };
            let mtime = meta
                .modified()
                .ok()
                .and_then(|t| t.duration_since(UNIX_EPOCH).ok())
                .map(|d| d.as_millis() as u64);
            out.push(Entry {
                name,
                path,
                kind,
                size: if kind == EntryKind::File {
                    Some(meta.len())
                } else {
                    None
                },
                mtime,
            });
        }
        Ok(out)
    }

    pub fn read(&self, rel: &str) -> Result<Vec<u8>> {
        let (norm, abs) = self.resolve(rel)?;
        if abs.is_dir() {
            return Err(BackendError::with_path(
                ErrorCode::Io,
                format!("파일이 아니라 폴더다: {norm}"),
                norm,
            ));
        }
        fs::read(&abs).map_err(|e| BackendError::io(&e, Some(&norm)))
    }

    pub fn read_text(&self, rel: &str) -> Result<String> {
        let bytes = self.read(rel)?;
        String::from_utf8(bytes).map_err(|_| {
            BackendError::with_path(ErrorCode::Io, format!("UTF-8 텍스트가 아니다: {rel}"), rel)
        })
    }

    /// 상위 폴더를 만들고 원자적으로 쓴다
    pub fn write(&self, rel: &str, data: &[u8]) -> Result<()> {
        let (norm, abs) = self.resolve(rel)?;
        if norm.is_empty() {
            return Err(BackendError::new(
                ErrorCode::Io,
                "프로젝트 루트에는 쓸 수 없다",
            ));
        }
        if abs.is_dir() {
            return Err(BackendError::with_path(
                ErrorCode::Io,
                format!("폴더에는 쓸 수 없다: {norm}"),
                norm,
            ));
        }
        let created = !abs.exists();
        self.remember_missing_dirs(&norm);
        self.remember(
            &norm,
            Expected::Content {
                hash: hash_bytes(data),
                created,
            },
        );
        write_atomic(&abs, data).map_err(|e| BackendError::io(&e, Some(&norm)))
    }

    pub fn mkdir(&self, rel: &str) -> Result<()> {
        let (norm, abs) = self.resolve(rel)?;
        if norm.is_empty() {
            return Ok(());
        }
        if abs.exists() {
            return if abs.is_dir() {
                Ok(())
            } else {
                Err(BackendError::with_path(
                    ErrorCode::Io,
                    format!("같은 이름의 파일이 있다: {norm}"),
                    norm,
                ))
            };
        }
        self.remember_missing_dirs(&norm);
        self.remember(&norm, Expected::Dir);
        fs::create_dir_all(&abs).map_err(|e| BackendError::io(&e, Some(&norm)))
    }

    /// 파일과 폴더(안이 차 있으면 통째로). 루트는 거부한다.
    pub fn remove(&self, rel: &str) -> Result<()> {
        let (norm, abs) = self.resolve(rel)?;
        if norm.is_empty() {
            return Err(BackendError::new(
                ErrorCode::Io,
                "프로젝트 루트는 지울 수 없다",
            ));
        }
        // 링크 자체를 본다 (링크가 가리키는 폴더 안으로 들어가지 않게)
        let meta = fs::symlink_metadata(&abs).map_err(|e| BackendError::io(&e, Some(&norm)))?;
        if meta.is_dir() {
            for child in walk_rels(&abs, &norm) {
                self.remember(&child, Expected::Gone);
            }
            self.remember(&norm, Expected::Gone);
            fs::remove_dir_all(&abs).map_err(|e| BackendError::io(&e, Some(&norm)))
        } else {
            self.remember(&norm, Expected::Gone);
            fs::remove_file(&abs).map_err(|e| BackendError::io(&e, Some(&norm)))
        }
    }

    pub fn rename(&self, from: &str, to: &str) -> Result<()> {
        let (norm_from, abs_from) = self.resolve(from)?;
        let (norm_to, abs_to) = self.resolve(to)?;
        if norm_from.is_empty() || norm_to.is_empty() {
            return Err(BackendError::new(
                ErrorCode::Io,
                "프로젝트 루트는 옮길 수 없다",
            ));
        }
        let meta =
            fs::symlink_metadata(&abs_from).map_err(|e| BackendError::io(&e, Some(&norm_from)))?;
        if let Some(parent) = abs_to.parent() {
            self.remember_missing_dirs(&norm_to);
            fs::create_dir_all(parent).map_err(|e| BackendError::io(&e, Some(&norm_to)))?;
        }
        self.remember(&norm_from, Expected::Gone);
        if meta.is_dir() {
            self.remember(&norm_to, Expected::Dir);
        } else if let Ok(data) = fs::read(&abs_from) {
            self.remember(
                &norm_to,
                Expected::Content {
                    hash: hash_bytes(&data),
                    created: !abs_to.exists(),
                },
            );
        }
        fs::rename(&abs_from, &abs_to).map_err(|e| BackendError::io(&e, Some(&norm_from)))
    }

    pub fn exists(&self, rel: &str) -> Result<bool> {
        let (_, abs) = self.resolve(rel)?;
        Ok(abs.exists())
    }
}

/// 폴더 아래 모든 항목의 상대 경로 (삭제 기록용). 읽을 수 없는 것은 건너뛴다.
fn walk_rels(abs: &Path, norm: &str) -> Vec<String> {
    let mut out = Vec::new();
    let mut stack = vec![(abs.to_path_buf(), norm.to_string())];
    while let Some((dir, rel)) = stack.pop() {
        let Ok(read_dir) = fs::read_dir(&dir) else {
            continue;
        };
        for entry in read_dir.flatten() {
            let name = entry.file_name().to_string_lossy().into_owned();
            let child_rel = format!("{rel}/{name}");
            if entry.file_type().map(|t| t.is_dir()).unwrap_or(false) {
                stack.push((entry.path(), child_rel.clone()));
            }
            out.push(child_rel);
        }
    }
    out
}

#[cfg(test)]
mod tests {
    // 적합성 테스트(packages/core/src/testing/conformance.ts)의 케이스를 그대로 옮긴 것이다.
    use super::*;
    use std::sync::Arc;
    use std::thread;

    const KOREAN_TEXT: &str = "-- 대사에는 줄바꿈과 따옴표와 한글이 들어간다\nlocal s = \"안녕, \\\"세계\\\"\"\nreturn s\n";

    fn project() -> (tempfile::TempDir, ProjectFs) {
        let dir = tempfile::tempdir().unwrap();
        let fs = ProjectFs::open(dir.path().to_str().unwrap()).unwrap();
        (dir, fs)
    }

    #[test]
    fn open_gives_name_and_game_json_flag() {
        let (dir, fs) = project();
        let info = fs.info();
        assert_eq!(info.name, dir.path().file_name().unwrap().to_string_lossy());
        assert!(!info.has_game_json);
        std::fs::write(dir.path().join("game.json"), "{}").unwrap();
        assert!(fs.info().has_game_json);
        assert!(Path::new(&info.root).is_absolute());
    }

    #[test]
    fn open_rejects_missing_and_file() {
        let dir = tempfile::tempdir().unwrap();
        let missing = dir.path().join("nope");
        assert_eq!(
            ProjectFs::open(missing.to_str().unwrap()).unwrap_err().code,
            ErrorCode::NotFound
        );
        let file = dir.path().join("f.txt");
        std::fs::write(&file, "x").unwrap();
        assert_eq!(
            ProjectFs::open(file.to_str().unwrap()).unwrap_err().code,
            ErrorCode::NotFound
        );
    }

    #[test]
    fn text_round_trip_and_parent_dirs() {
        let (_dir, fs) = project();
        fs.write("scripts/lua/conf/deep/x.lua", KOREAN_TEXT.as_bytes())
            .unwrap();
        assert_eq!(
            fs.read_text("scripts/lua/conf/deep/x.lua").unwrap(),
            KOREAN_TEXT
        );
        assert!(fs.exists("scripts/lua/conf/deep").unwrap());
        assert!(fs.exists("scripts/lua/conf/deep/x.lua").unwrap());
        assert!(!fs.exists("scripts/lua/conf/deep/nope.lua").unwrap());
    }

    #[test]
    fn binary_round_trip() {
        let (_dir, fs) = project();
        let data: Vec<u8> = (0..512u32).map(|i| ((i * 31) & 0xff) as u8).collect();
        fs.write("resources/images/blob.bin", &data).unwrap();
        assert_eq!(fs.read("resources/images/blob.bin").unwrap(), data);
    }

    #[test]
    fn overwrite_keeps_last_content() {
        let (_dir, fs) = project();
        fs.write("scripts/a.lua", b"1").unwrap();
        fs.write("scripts/a.lua", b"22").unwrap();
        fs.write("scripts/a.lua", b"333").unwrap();
        assert_eq!(fs.read_text("scripts/a.lua").unwrap(), "333");
    }

    #[test]
    fn list_is_one_level_with_kinds_sizes_and_paths() {
        let (_dir, fs) = project();
        fs.write("scripts/lua/main.lua", b"a").unwrap();
        fs.write("scripts/lua/sub/x.lua", b"b").unwrap();
        fs.write("scripts/ruby/main.rb", b"c").unwrap();
        let root = fs.list("").unwrap();
        let scripts = root.iter().find(|e| e.name == "scripts").unwrap();
        assert_eq!(scripts.kind, EntryKind::Dir);
        assert_eq!(scripts.path, "scripts");
        assert!(scripts.size.is_none());
        let mut lua: Vec<String> = fs
            .list("scripts/lua")
            .unwrap()
            .iter()
            .map(|e| format!("{:?}:{}", e.kind, e.name))
            .collect();
        lua.sort();
        assert_eq!(lua, vec!["Dir:sub", "File:main.lua"]);
        let entries = fs.list("scripts/lua").unwrap();
        let main = entries.iter().find(|e| e.name == "main.lua").unwrap();
        assert_eq!(main.path, "scripts/lua/main.lua");
        assert_eq!(main.size, Some(1));
        assert!(main.mtime.is_some());
        assert_eq!(fs.list("scripts/lua/").unwrap().len(), 2);
    }

    #[test]
    fn missing_dir_and_file_are_not_found() {
        let (_dir, fs) = project();
        assert_eq!(
            fs.list("scripts/nowhere").unwrap_err().code,
            ErrorCode::NotFound
        );
        assert_eq!(
            fs.read_text("scripts/nowhere.lua").unwrap_err().code,
            ErrorCode::NotFound
        );
        assert_eq!(
            fs.remove("scripts/nowhere.lua").unwrap_err().code,
            ErrorCode::NotFound
        );
        assert_eq!(
            fs.rename("scripts/nowhere.lua", "scripts/x.lua")
                .unwrap_err()
                .code,
            ErrorCode::NotFound
        );
        fs.write("scripts/file.lua", b"x").unwrap();
        assert_eq!(
            fs.list("scripts/file.lua").unwrap_err().code,
            ErrorCode::NotFound
        );
    }

    #[test]
    fn outside_root_is_rejected_everywhere() {
        let (_dir, fs) = project();
        for bad in [
            "../x.lua",
            "scripts/../../x.lua",
            "..",
            "/etc/passwd",
            "C:\\Windows\\x",
        ] {
            assert_eq!(
                fs.read_text(bad).unwrap_err().code,
                ErrorCode::OutsideRoot,
                "read {bad}"
            );
            assert_eq!(
                fs.write(bad, b"x").unwrap_err().code,
                ErrorCode::OutsideRoot,
                "write {bad}"
            );
            assert_eq!(
                fs.list(bad).unwrap_err().code,
                ErrorCode::OutsideRoot,
                "list {bad}"
            );
            assert_eq!(
                fs.remove(bad).unwrap_err().code,
                ErrorCode::OutsideRoot,
                "remove {bad}"
            );
            assert_eq!(
                fs.mkdir(bad).unwrap_err().code,
                ErrorCode::OutsideRoot,
                "mkdir {bad}"
            );
            assert_eq!(
                fs.exists(bad).unwrap_err().code,
                ErrorCode::OutsideRoot,
                "exists {bad}"
            );
            assert_eq!(
                fs.rename(bad, "a").unwrap_err().code,
                ErrorCode::OutsideRoot,
                "rename from {bad}"
            );
            assert_eq!(
                fs.rename("a", bad).unwrap_err().code,
                ErrorCode::OutsideRoot,
                "rename to {bad}"
            );
        }
    }

    #[cfg(unix)]
    #[test]
    fn symlink_escape_is_outside_root() {
        let (dir, fs) = project();
        let outside = tempfile::tempdir().unwrap();
        std::fs::write(outside.path().join("secret.txt"), "top secret").unwrap();
        std::fs::create_dir_all(dir.path().join("scripts")).unwrap();
        // 폴더 링크와 파일 링크 둘 다
        std::os::unix::fs::symlink(outside.path(), dir.path().join("scripts/link")).unwrap();
        std::os::unix::fs::symlink(
            outside.path().join("secret.txt"),
            dir.path().join("scripts/secret.lua"),
        )
        .unwrap();
        assert_eq!(
            fs.read_text("scripts/link/secret.txt").unwrap_err().code,
            ErrorCode::OutsideRoot
        );
        assert_eq!(
            fs.write("scripts/link/new.txt", b"x").unwrap_err().code,
            ErrorCode::OutsideRoot
        );
        assert_eq!(
            fs.write("scripts/link/deeper/new.txt", b"x")
                .unwrap_err()
                .code,
            ErrorCode::OutsideRoot
        );
        assert_eq!(
            fs.list("scripts/link").unwrap_err().code,
            ErrorCode::OutsideRoot
        );
        assert_eq!(
            fs.remove("scripts/link/secret.txt").unwrap_err().code,
            ErrorCode::OutsideRoot
        );
        assert_eq!(
            fs.read_text("scripts/secret.lua").unwrap_err().code,
            ErrorCode::OutsideRoot
        );
        assert!(!outside.path().join("new.txt").exists());
        assert_eq!(
            std::fs::read_to_string(outside.path().join("secret.txt")).unwrap(),
            "top secret"
        );
        // 루트 안을 가리키는 링크는 된다
        std::fs::write(dir.path().join("scripts/real.lua"), "ok").unwrap();
        std::os::unix::fs::symlink(
            dir.path().join("scripts/real.lua"),
            dir.path().join("scripts/alias.lua"),
        )
        .unwrap();
        assert_eq!(fs.read_text("scripts/alias.lua").unwrap(), "ok");
    }

    #[test]
    fn mkdir_rename_remove() {
        let (_dir, fs) = project();
        fs.mkdir("resources/maps").unwrap();
        assert!(fs.exists("resources/maps").unwrap());
        assert!(fs
            .list("resources")
            .unwrap()
            .iter()
            .any(|e| e.name == "maps" && e.kind == EntryKind::Dir));
        fs.mkdir("resources/maps").unwrap();
        fs.write("resources/maps/a.json", b"{}").unwrap();
        fs.rename("resources/maps/a.json", "resources/maps/b.json")
            .unwrap();
        assert!(!fs.exists("resources/maps/a.json").unwrap());
        assert_eq!(fs.read_text("resources/maps/b.json").unwrap(), "{}");
        fs.rename("resources/maps", "resources/maps2").unwrap();
        assert_eq!(fs.read_text("resources/maps2/b.json").unwrap(), "{}");
        fs.remove("resources/maps2/b.json").unwrap();
        assert!(!fs.exists("resources/maps2/b.json").unwrap());
        fs.write("resources/maps2/deep/c.json", b"1").unwrap();
        fs.remove("resources/maps2").unwrap();
        assert!(!fs.exists("resources/maps2").unwrap());
        assert!(fs.exists("resources").unwrap());
    }

    #[test]
    fn root_is_not_removable_or_writable() {
        let (dir, fs) = project();
        let err = fs.remove("").unwrap_err();
        assert_eq!(err.code, ErrorCode::Io);
        assert_eq!(fs.remove("/").unwrap_err().code, ErrorCode::Io);
        assert_eq!(fs.write("", b"x").unwrap_err().code, ErrorCode::Io);
        assert_eq!(fs.rename("", "x").unwrap_err().code, ErrorCode::Io);
        assert!(dir.path().is_dir());
        assert!(fs.exists("").unwrap());
        fs.mkdir("").unwrap();
    }

    #[test]
    fn atomic_write_leaves_no_temp_file_and_no_partial_read() {
        let (dir, fs) = project();
        let fs = Arc::new(fs);
        let big: Vec<u8> = (0..(2 * 1024 * 1024u32)).map(|i| (i % 251) as u8).collect();
        fs.write("resources/big.bin", &big).unwrap();
        let names: Vec<String> = std::fs::read_dir(dir.path().join("resources"))
            .unwrap()
            .map(|e| e.unwrap().file_name().to_string_lossy().into_owned())
            .collect();
        assert_eq!(names, vec!["big.bin".to_string()]);

        // 쓰는 동안 다른 스레드가 계속 읽는다. 읽은 내용은 늘 옛것 아니면 새것이어야 한다.
        let old = big.clone();
        let new: Vec<u8> = big.iter().map(|b| b.wrapping_add(1)).collect();
        let reader_fs = Arc::clone(&fs);
        let (old_r, new_r) = (old.clone(), new.clone());
        let reader = thread::spawn(move || {
            let mut reads = 0usize;
            let start = Instant::now();
            while start.elapsed() < Duration::from_millis(600) {
                let got = reader_fs.read("resources/big.bin").unwrap();
                assert!(
                    got == old_r || got == new_r,
                    "partial file seen ({} bytes)",
                    got.len()
                );
                reads += 1;
            }
            reads
        });
        for i in 0..20 {
            fs.write("resources/big.bin", if i % 2 == 0 { &new } else { &old })
                .unwrap();
        }
        let reads = reader.join().unwrap();
        assert!(reads > 0);
        let names: Vec<String> = std::fs::read_dir(dir.path().join("resources"))
            .unwrap()
            .map(|e| e.unwrap().file_name().to_string_lossy().into_owned())
            .collect();
        assert_eq!(names, vec!["big.bin".to_string()]);
    }

    #[test]
    fn writes_are_remembered_for_the_watcher() {
        let (_dir, fs) = project();
        fs.write("scripts/lua/a.lua", b"x").unwrap();
        let mut recent = lock(&fs.recent);
        assert_eq!(
            recent.get("scripts/lua/a.lua"),
            Some(Expected::Content {
                hash: hash_bytes(b"x"),
                created: true
            })
        );
        assert_eq!(recent.get("scripts/lua"), Some(Expected::Dir));
        assert_eq!(recent.get("scripts"), Some(Expected::Dir));
        drop(recent);
        fs.write("scripts/lua/a.lua", b"y").unwrap();
        assert_eq!(
            lock(&fs.recent).get("scripts/lua/a.lua"),
            Some(Expected::Content {
                hash: hash_bytes(b"y"),
                created: false
            })
        );
        fs.rename("scripts/lua/a.lua", "scripts/lua/b.lua").unwrap();
        assert_eq!(
            lock(&fs.recent).get("scripts/lua/a.lua"),
            Some(Expected::Gone)
        );
        assert_eq!(
            lock(&fs.recent).get("scripts/lua/b.lua"),
            Some(Expected::Content {
                hash: hash_bytes(b"y"),
                created: true
            })
        );
        fs.remove("scripts").unwrap();
        assert_eq!(
            lock(&fs.recent).get("scripts/lua/b.lua"),
            Some(Expected::Gone)
        );
        assert_eq!(lock(&fs.recent).get("scripts/lua"), Some(Expected::Gone));
        assert_eq!(lock(&fs.recent).get("scripts"), Some(Expected::Gone));
    }
}
