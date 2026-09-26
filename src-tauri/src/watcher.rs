// 파일 감시 (notify). 프로젝트 루트를 재귀로 보고, 경로마다 50ms 디바운스한 뒤 콜백으로 넘긴다.
// 셸(commands.rs)은 그 콜백에서 `fs:change` 이벤트를 프런트로 보낸다.
//
// 핵심(WatcherCore)은 AppHandle 을 모른다. 경로 거르기, 디바운스, self/external 판정, 이벤트가 잠잠해진 뒤
// 실제 존재 여부로 종류(create/modify/delete)를 정하는 것까지 콜백 하나만 받는 구조라 웹뷰 없이 테스트한다.
//
// self 판정: project.rs 가 기록한 RecentWrites(경로 → 기대 상태)와 실제 파일을 대조한다. 내용 해시가 같으면
// 이 에디터가 쓴 것, 아니면 밖에서 바뀐 것이다 (브리지 서버의 classifyChange 와 같다).

use std::collections::HashMap;
use std::path::{Path, PathBuf};
use std::sync::mpsc::{self, Receiver, RecvTimeoutError, Sender};
use std::sync::{Arc, Mutex};
use std::thread::{self, JoinHandle};
use std::time::{Duration, Instant};

use notify::{Event, EventKind, RecommendedWatcher, RecursiveMode, Watcher};
use serde::Serialize;

use crate::fsutil::{hash_bytes, is_temp_name, lock};
use crate::project::{Expected, RecentWrites};

pub const DEBOUNCE: Duration = Duration::from_millis(50);
/// 이 이름의 폴더 아래는 보지 않는다 (엔진 빌드 산출물, 의존성, 버전 관리)
pub const SKIP_DIRS: [&str; 4] = [".git", "node_modules", "target", "build"];

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize)]
#[serde(rename_all = "lowercase")]
pub enum ChangeKind {
    Create,
    Modify,
    Delete,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize)]
#[serde(rename_all = "lowercase")]
pub enum Origin {
    /// 이 에디터가 쓴 것 (JSON 으로는 "self")
    #[serde(rename = "self")]
    Own,
    External,
}

/// 프런트로 가는 `fs:change` 페이로드 (core 의 ChangeEvent 와 같은 모양)
#[derive(Debug, Clone, Serialize)]
pub struct ChangeEvent {
    pub path: String,
    pub kind: ChangeKind,
    pub origin: Origin,
}

/// notify 가 준 이벤트 종류를 거칠게 요약한 것. 최종 종류는 실제 존재 여부로 정한다.
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum RawKind {
    Create,
    Remove,
    Modify,
    Other,
}

impl From<&EventKind> for RawKind {
    fn from(kind: &EventKind) -> Self {
        match kind {
            EventKind::Create(_) => RawKind::Create,
            EventKind::Remove(_) => RawKind::Remove,
            EventKind::Modify(_) => RawKind::Modify,
            _ => RawKind::Other,
        }
    }
}

pub enum Msg {
    Paths(Vec<PathBuf>, RawKind),
    Stop,
}

pub struct WatcherCore {
    root: PathBuf,
    recent: Arc<Mutex<RecentWrites>>,
    debounce: Duration,
    emit: Box<dyn Fn(ChangeEvent) + Send>,
}

impl WatcherCore {
    /// `root` 는 canonicalize 된 프로젝트 루트 (ProjectFs::root)
    pub fn new(
        root: PathBuf,
        recent: Arc<Mutex<RecentWrites>>,
        emit: impl Fn(ChangeEvent) + Send + 'static,
    ) -> Self {
        Self {
            root,
            recent,
            debounce: DEBOUNCE,
            emit: Box::new(emit),
        }
    }

    pub fn with_debounce(mut self, debounce: Duration) -> Self {
        self.debounce = debounce;
        self
    }

    pub fn root(&self) -> &Path {
        &self.root
    }

    /// 절대 경로 → 루트 기준 상대 경로. 루트 밖, 루트 자신, 건너뛸 폴더 아래, 우리 임시 파일이면 None.
    pub fn rel_of(&self, abs: &Path) -> Option<String> {
        let rest = abs.strip_prefix(&self.root).ok()?;
        let mut parts: Vec<&str> = Vec::new();
        for component in rest.components() {
            let seg = component.as_os_str().to_str()?;
            if SKIP_DIRS.contains(&seg) || is_temp_name(seg) {
                return None;
            }
            parts.push(seg);
        }
        if parts.is_empty() {
            return None;
        }
        Some(parts.join("/"))
    }

    /// 기록과 실제 상태를 대조해 self 인지 external 인지. self 면 그 기록도 돌려준다.
    pub fn classify(&self, rel: &str, exists: bool) -> (Origin, Option<Expected>) {
        let abs = self.root.join(rel);
        let mut recent = lock(&self.recent);
        let Some(expected) = recent.get(rel) else {
            return (Origin::External, None);
        };
        let matches = match expected {
            Expected::Gone => !exists,
            Expected::Dir => abs.is_dir(),
            Expected::Content { hash, .. } => {
                exists
                    && std::fs::read(&abs)
                        .map(|d| hash_bytes(&d) == hash)
                        .unwrap_or(false)
            }
        };
        if matches {
            (Origin::Own, Some(expected))
        } else {
            recent.forget(rel);
            (Origin::External, None)
        }
    }

    /// 이벤트가 잠잠해진 뒤 호출된다. 지금 없으면 delete, 새로 생긴 것이면 create, 나머지는 modify.
    pub fn resolve(&self, rel: &str, saw_create: bool) -> ChangeEvent {
        let exists = std::fs::symlink_metadata(self.root.join(rel)).is_ok();
        let (origin, expected) = self.classify(rel, exists);
        let kind = if !exists {
            ChangeKind::Delete
        } else if saw_create
            || matches!(
                expected,
                Some(Expected::Content { created: true, .. }) | Some(Expected::Dir)
            )
        {
            ChangeKind::Create
        } else {
            ChangeKind::Modify
        };
        ChangeEvent {
            path: rel.to_string(),
            kind,
            origin,
        }
    }

    /// 수신 루프. Stop 이 오거나 보내는 쪽이 전부 사라질 때까지 돈다.
    pub fn run(&self, rx: Receiver<Msg>) {
        struct Pending {
            due: Instant,
            saw_create: bool,
        }
        let idle = Duration::from_secs(3600);
        let mut pending: HashMap<String, Pending> = HashMap::new();
        loop {
            let wait = pending
                .values()
                .map(|p| p.due)
                .min()
                .map(|due| due.saturating_duration_since(Instant::now()))
                .unwrap_or(idle);
            match rx.recv_timeout(wait) {
                Ok(Msg::Paths(paths, raw)) => {
                    let due = Instant::now() + self.debounce;
                    for path in paths {
                        if let Some(rel) = self.rel_of(&path) {
                            let entry = pending.entry(rel).or_insert(Pending {
                                due,
                                saw_create: false,
                            });
                            entry.due = due;
                            entry.saw_create |= raw == RawKind::Create;
                        }
                    }
                }
                Ok(Msg::Stop) | Err(RecvTimeoutError::Disconnected) => break,
                Err(RecvTimeoutError::Timeout) => {}
            }
            let now = Instant::now();
            let mut ready: Vec<String> = pending
                .iter()
                .filter(|(_, p)| p.due <= now)
                .map(|(k, _)| k.clone())
                .collect();
            ready.sort();
            for rel in ready {
                let saw_create = pending.remove(&rel).map(|p| p.saw_create).unwrap_or(false);
                (self.emit)(self.resolve(&rel, saw_create));
            }
        }
    }
}

/// 돌고 있는 감시. 놓으면(drop) 감시를 끄고 스레드를 기다린다.
pub struct WatcherHandle {
    tx: Sender<Msg>,
    thread: Option<JoinHandle<()>>,
    watcher: Option<RecommendedWatcher>,
}

impl WatcherHandle {
    pub fn stop(mut self) {
        self.shutdown();
    }

    fn shutdown(&mut self) {
        // 먼저 notify 를 놓아 새 이벤트를 막고, 그다음 루프를 끝낸다
        self.watcher.take();
        let _ = self.tx.send(Msg::Stop);
        if let Some(thread) = self.thread.take() {
            let _ = thread.join();
        }
    }
}

impl Drop for WatcherHandle {
    fn drop(&mut self) {
        self.shutdown();
    }
}

/// notify 감시를 켜고 core.run 을 전용 스레드에서 돌린다.
pub fn start(core: WatcherCore) -> notify::Result<WatcherHandle> {
    let (tx, rx) = mpsc::channel::<Msg>();
    let root = core.root.clone();
    let event_tx = tx.clone();
    let mut watcher = RecommendedWatcher::new(
        move |result: notify::Result<Event>| {
            if let Ok(event) = result {
                let _ = event_tx.send(Msg::Paths(event.paths, RawKind::from(&event.kind)));
            }
        },
        notify::Config::default(),
    )?;
    watcher.watch(&root, RecursiveMode::Recursive)?;
    let thread = thread::Builder::new()
        .name("initial-editor-fs-watch".into())
        .spawn(move || core.run(rx))
        .map_err(notify::Error::io)?;
    Ok(WatcherHandle {
        tx,
        thread: Some(thread),
        watcher: Some(watcher),
    })
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::project::ProjectFs;
    use std::sync::mpsc::channel;

    fn core_for(fs: &ProjectFs) -> (WatcherCore, Receiver<ChangeEvent>) {
        let (tx, rx) = channel::<ChangeEvent>();
        let core = WatcherCore::new(fs.root().to_path_buf(), fs.recent(), move |e| {
            let _ = tx.send(e);
        });
        (core, rx)
    }

    /// 조건에 맞는 이벤트가 올 때까지 기다린다 (FSEvents 는 수백 ms 걸릴 수 있다)
    fn wait_for(rx: &Receiver<ChangeEvent>, pred: impl Fn(&ChangeEvent) -> bool) -> ChangeEvent {
        let deadline = Instant::now() + Duration::from_secs(8);
        loop {
            let left = deadline.saturating_duration_since(Instant::now());
            match rx.recv_timeout(left) {
                Ok(e) if pred(&e) => return e,
                Ok(_) => continue,
                Err(_) => panic!("기다리던 감시 이벤트가 오지 않았다"),
            }
        }
    }

    #[test]
    fn rel_of_filters_and_relativizes() {
        let dir = tempfile::tempdir().unwrap();
        let fs = ProjectFs::open(dir.path().to_str().unwrap()).unwrap();
        let (core, _rx) = core_for(&fs);
        let root = fs.root();
        assert_eq!(
            core.rel_of(&root.join("scripts").join("a.lua")).as_deref(),
            Some("scripts/a.lua")
        );
        assert_eq!(core.rel_of(root), None);
        assert_eq!(core.rel_of(Path::new("/somewhere/else/a.lua")), None);
        assert_eq!(core.rel_of(&root.join(".git").join("HEAD")), None);
        assert_eq!(
            core.rel_of(&root.join("node_modules").join("x").join("y.js")),
            None
        );
        assert_eq!(core.rel_of(&root.join("build").join("Initial2D")), None);
        assert_eq!(
            core.rel_of(&root.join("scripts").join("target").join("x")),
            None
        );
        assert_eq!(
            core.rel_of(&root.join("scripts").join(".a.lua.tmp-1-2-3")),
            None
        );
        assert_eq!(
            core.rel_of(&root.join(".gitignore")).as_deref(),
            Some(".gitignore")
        );
        assert_eq!(
            core.rel_of(&root.join(".initial-editor").join("layout.json"))
                .as_deref(),
            Some(".initial-editor/layout.json")
        );
    }

    #[test]
    fn resolve_uses_recent_writes_without_notify() {
        let dir = tempfile::tempdir().unwrap();
        let fs = ProjectFs::open(dir.path().to_str().unwrap()).unwrap();
        let (core, _rx) = core_for(&fs);
        fs.write("scripts/a.lua", b"x").unwrap();
        let e = core.resolve("scripts/a.lua", false);
        assert_eq!((e.kind, e.origin), (ChangeKind::Create, Origin::Own));
        assert_eq!(core.resolve("scripts", false).origin, Origin::Own);
        // 밖에서 내용을 바꾸면 기록과 달라 external
        std::fs::write(fs.root().join("scripts/a.lua"), "changed").unwrap();
        let e = core.resolve("scripts/a.lua", false);
        assert_eq!((e.kind, e.origin), (ChangeKind::Modify, Origin::External));
        // 기록이 없는 경로는 external, 없는 파일은 delete
        let e = core.resolve("scripts/never.lua", false);
        assert_eq!((e.kind, e.origin), (ChangeKind::Delete, Origin::External));
        fs.remove("scripts/a.lua").unwrap();
        let e = core.resolve("scripts/a.lua", false);
        assert_eq!((e.kind, e.origin), (ChangeKind::Delete, Origin::Own));
        // notify 가 create 라고 했으면 create
        std::fs::write(fs.root().join("scripts/b.lua"), "ext").unwrap();
        let e = core.resolve("scripts/b.lua", true);
        assert_eq!((e.kind, e.origin), (ChangeKind::Create, Origin::External));
    }

    #[test]
    fn debounce_loop_coalesces_and_flushes() {
        let dir = tempfile::tempdir().unwrap();
        let fs = ProjectFs::open(dir.path().to_str().unwrap()).unwrap();
        let (core, rx) = core_for(&fs);
        let core = core.with_debounce(Duration::from_millis(20));
        let (tx, msg_rx) = mpsc::channel::<Msg>();
        let root = fs.root().to_path_buf();
        let thread = thread::spawn(move || core.run(msg_rx));
        std::fs::create_dir_all(root.join("scripts")).unwrap();
        std::fs::write(root.join("scripts/a.lua"), "1").unwrap();
        // 같은 경로의 이벤트 셋은 하나로 합쳐진다
        for _ in 0..3 {
            tx.send(Msg::Paths(
                vec![root.join("scripts/a.lua")],
                RawKind::Modify,
            ))
            .unwrap();
        }
        tx.send(Msg::Paths(vec![root.join(".git/index")], RawKind::Modify))
            .unwrap();
        let e = rx.recv_timeout(Duration::from_secs(2)).unwrap();
        assert_eq!(e.path, "scripts/a.lua");
        assert_eq!(e.kind, ChangeKind::Modify);
        assert_eq!(e.origin, Origin::External);
        assert!(
            rx.recv_timeout(Duration::from_millis(150)).is_err(),
            "coalesced events must not repeat"
        );
        tx.send(Msg::Stop).unwrap();
        thread.join().unwrap();
    }

    #[test]
    fn notify_backed_watcher_classifies_self_external_and_delete() {
        let dir = tempfile::tempdir().unwrap();
        let fs = ProjectFs::open(dir.path().to_str().unwrap()).unwrap();
        std::fs::create_dir_all(fs.root().join("scripts")).unwrap();
        let (core, rx) = core_for(&fs);
        let handle = start(core).expect("notify 감시를 켤 수 없다");
        // 감시 스트림이 자리 잡을 시간
        thread::sleep(Duration::from_millis(300));

        fs.write("scripts/mine.lua", b"written by editor").unwrap();
        let e = wait_for(&rx, |e| e.path == "scripts/mine.lua");
        assert_eq!(e.origin, Origin::Own, "{e:?}");
        assert_ne!(e.kind, ChangeKind::Delete, "{e:?}");

        std::fs::write(fs.root().join("scripts/theirs.lua"), "changed outside").unwrap();
        let e = wait_for(&rx, |e| e.path == "scripts/theirs.lua");
        assert_eq!(e.origin, Origin::External, "{e:?}");
        assert_ne!(e.kind, ChangeKind::Delete, "{e:?}");

        // 우리가 쓴 파일을 밖에서 덮어쓰면 external
        std::fs::write(fs.root().join("scripts/mine.lua"), "overwritten outside").unwrap();
        let e = wait_for(&rx, |e| {
            e.path == "scripts/mine.lua" && e.origin == Origin::External
        });
        assert_eq!(e.kind, ChangeKind::Modify, "{e:?}");

        fs.remove("scripts/mine.lua").unwrap();
        let e = wait_for(&rx, |e| {
            e.path == "scripts/mine.lua" && e.kind == ChangeKind::Delete
        });
        assert_eq!(e.origin, Origin::Own, "{e:?}");

        std::fs::remove_file(fs.root().join("scripts/theirs.lua")).unwrap();
        let e = wait_for(&rx, |e| {
            e.path == "scripts/theirs.lua" && e.kind == ChangeKind::Delete
        });
        assert_eq!(e.origin, Origin::External, "{e:?}");

        // 임시 파일은 절대 보이지 않는다
        handle.stop();
        while let Ok(e) = rx.try_recv() {
            assert!(!is_temp_name(e.path.rsplit('/').next().unwrap()), "{e:?}");
        }
    }
}
