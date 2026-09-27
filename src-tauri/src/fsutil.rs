// 파일 쓰기 보조: 원자적 쓰기, 내용 해시, 뮤텍스 잠금.
//
// 원자적 쓰기는 같은 폴더의 임시 파일(`.<이름>.tmp-<pid>-<시각>-<번호>`)에 전부 쓴 뒤 rename 한다.
// rename 은 같은 파일 시스템 안에서 원자적이라 실행 중인 게임이나 다른 프로세스가 반쯤 쓰인 파일을
// 읽는 일이 없다. 브리지 서버(tools/bridge/lib/files.js)와 같은 방식이고 fsync 는 하지 않는다
// (전원 차단 내구성이 아니라 동시 읽기 안전이 목적이다).
//
// Windows 는 다른 손(지우기 공유 없이 연 읽기, 바이러스 검사기)이 파일을 쥔 동안 바꿔 치우기를 거부하고, 그 순간의
// 읽기도 거부될 수 있다. 그런 잠깐의 잠금은 정해진 시간 안에서 다시 한다 (retry_transient).

use std::fs;
use std::io::{self, Write};
use std::path::Path;
use std::sync::atomic::{AtomicU64, Ordering};
use std::sync::{Mutex, MutexGuard};
use std::thread;
use std::time::{Duration, Instant, SystemTime, UNIX_EPOCH};

/// 바꿔 치우기(rename)가 잠깐의 잠금으로 거부될 때 다시 해 보는 시간
pub const REPLACE_RETRY: Duration = Duration::from_secs(2);
/// 읽기가 잠깐의 잠금으로 거부될 때 다시 해 보는 시간
pub const READ_RETRY: Duration = Duration::from_secs(1);

static COUNTER: AtomicU64 = AtomicU64::new(0);

/// 임시 파일 이름. 앞의 점은 목록에서 눈에 덜 띄게, `.tmp-` 는 감시가 걸러내는 표식이다.
pub fn temp_name(name: &str) -> String {
    let nanos = SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .map(|d| d.as_nanos())
        .unwrap_or(0);
    let n = COUNTER.fetch_add(1, Ordering::Relaxed);
    format!(".{name}.tmp-{}-{nanos:x}-{n}", std::process::id())
}

/// 우리 임시 파일 이름인가 (감시 이벤트에서 제외한다)
pub fn is_temp_name(name: &str) -> bool {
    name.starts_with('.') && name.contains(".tmp-")
}

/// 상위 폴더를 만들고 원자적으로 쓴다. 실패하면 임시 파일을 치운다.
pub fn write_atomic(abs: &Path, data: &[u8]) -> io::Result<()> {
    let parent = abs
        .parent()
        .ok_or_else(|| io::Error::new(io::ErrorKind::InvalidInput, "부모 폴더가 없는 경로"))?;
    let name = abs
        .file_name()
        .and_then(|n| n.to_str())
        .ok_or_else(|| io::Error::new(io::ErrorKind::InvalidInput, "파일 이름이 없는 경로"))?;
    fs::create_dir_all(parent)?;
    let tmp = parent.join(temp_name(name));
    let result = (|| {
        let mut file = fs::File::create(&tmp)?;
        file.write_all(data)?;
        file.flush()?;
        drop(file);
        retry_transient(REPLACE_RETRY, is_transient_lock, || fs::rename(&tmp, abs))
    })();
    if result.is_err() {
        let _ = fs::remove_file(&tmp);
    }
    result
}

/// Windows 에서 다른 손이 파일을 잠깐 쥐고 있어 나는 오류인가: 접근 거부(5), 공유 위반(32), 잠금 위반(33).
/// 다른 OS 에서는 늘 false 다 (거기서의 권한 오류는 기다려도 풀리지 않는다)
pub fn is_transient_lock(e: &io::Error) -> bool {
    cfg!(windows) && matches!(e.raw_os_error(), Some(5 | 32 | 33))
}

/// op 가 transient 한 오류로 실패하면 budget 안에서 다시 한다 (5 ms 부터 두 배씩, 한 번에 100 ms 까지 쉰다).
/// 그 밖의 오류와 성공은 바로 돌려주고, 시간이 다 되면 마지막 오류를 돌려준다
pub fn retry_transient<T>(
    budget: Duration,
    transient: impl Fn(&io::Error) -> bool,
    mut op: impl FnMut() -> io::Result<T>,
) -> io::Result<T> {
    let deadline = Instant::now() + budget;
    let mut wait = Duration::from_millis(5);
    loop {
        match op() {
            Err(e) if transient(&e) && Instant::now() + wait <= deadline => {
                thread::sleep(wait);
                wait = (wait * 2).min(Duration::from_millis(100));
            }
            result => return result,
        }
    }
}

/// FNV-1a 64비트. 감시 이벤트가 우리가 쓴 내용인지 대조하는 데만 쓴다.
pub fn hash_bytes(data: &[u8]) -> u64 {
    let mut h: u64 = 0xcbf2_9ce4_8422_2325;
    for b in data {
        h ^= u64::from(*b);
        h = h.wrapping_mul(0x0100_0000_01b3);
    }
    h
}

/// 다른 스레드가 패닉했어도 잠근다 (지키는 값은 단순 상태라 그대로 써도 된다).
pub fn lock<T>(m: &Mutex<T>) -> MutexGuard<'_, T> {
    m.lock().unwrap_or_else(|poisoned| poisoned.into_inner())
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn temp_names_are_recognized_and_unique() {
        let a = temp_name("x.lua");
        let b = temp_name("x.lua");
        assert_ne!(a, b);
        assert!(is_temp_name(&a));
        assert!(!is_temp_name("x.lua"));
        assert!(!is_temp_name(".gitignore"));
    }

    #[test]
    fn atomic_write_leaves_no_temp_file() {
        let dir = tempfile::tempdir().unwrap();
        let target = dir.path().join("deep").join("a.txt");
        write_atomic(&target, b"hello").unwrap();
        assert_eq!(fs::read(&target).unwrap(), b"hello");
        let names: Vec<String> = fs::read_dir(target.parent().unwrap())
            .unwrap()
            .map(|e| e.unwrap().file_name().to_string_lossy().into_owned())
            .collect();
        assert_eq!(names, vec!["a.txt".to_string()]);
    }

    #[test]
    fn transient_errors_are_retried_within_the_budget() {
        let busy = |e: &io::Error| e.kind() == io::ErrorKind::WouldBlock;
        // 두 번 막혔다가 풀린다
        let mut calls = 0;
        let got = retry_transient(Duration::from_secs(2), busy, || {
            calls += 1;
            if calls < 3 {
                Err(io::Error::from(io::ErrorKind::WouldBlock))
            } else {
                Ok(calls)
            }
        });
        assert_eq!(got.unwrap(), 3);
        // 다른 오류는 다시 하지 않는다
        let mut calls = 0;
        let got: io::Result<()> = retry_transient(Duration::from_secs(2), busy, || {
            calls += 1;
            Err(io::Error::from(io::ErrorKind::NotFound))
        });
        assert_eq!(got.unwrap_err().kind(), io::ErrorKind::NotFound);
        assert_eq!(calls, 1);
        // 끝내 막히면 시간이 다 된 뒤 마지막 오류
        let start = Instant::now();
        let got: io::Result<()> = retry_transient(Duration::from_millis(100), busy, || {
            Err(io::Error::from(io::ErrorKind::WouldBlock))
        });
        assert_eq!(got.unwrap_err().kind(), io::ErrorKind::WouldBlock);
        assert!(start.elapsed() >= Duration::from_millis(50));
        assert!(start.elapsed() < Duration::from_secs(2));
    }

    #[test]
    fn only_windows_locks_are_transient() {
        let denied = io::Error::from_raw_os_error(5);
        let sharing = io::Error::from_raw_os_error(32);
        assert_eq!(is_transient_lock(&denied), cfg!(windows));
        assert_eq!(is_transient_lock(&sharing), cfg!(windows));
        assert!(!is_transient_lock(&io::Error::from(
            io::ErrorKind::NotFound
        )));
    }

    /// 지우기 공유 없이 연 손잡이가 있는 동안 Windows 는 바꿔 치우기를 거부한다. 놓이면 쓰기가 끝난다
    #[cfg(windows)]
    #[test]
    fn replace_waits_for_a_handle_without_share_delete() {
        use std::os::windows::fs::OpenOptionsExt;
        const FILE_SHARE_READ: u32 = 0x1;
        let dir = tempfile::tempdir().unwrap();
        let target = dir.path().join("a.txt");
        write_atomic(&target, b"old").unwrap();
        let held = fs::OpenOptions::new()
            .read(true)
            .share_mode(FILE_SHARE_READ)
            .open(&target)
            .unwrap();
        let release = thread::spawn(move || {
            thread::sleep(Duration::from_millis(200));
            drop(held);
        });
        write_atomic(&target, b"new").unwrap();
        release.join().unwrap();
        assert_eq!(fs::read(&target).unwrap(), b"new");
        let names: Vec<String> = fs::read_dir(dir.path())
            .unwrap()
            .map(|e| e.unwrap().file_name().to_string_lossy().into_owned())
            .collect();
        assert_eq!(names, vec!["a.txt".to_string()]);
    }

    #[test]
    fn hash_is_stable() {
        assert_eq!(hash_bytes(b""), 0xcbf2_9ce4_8422_2325);
        assert_eq!(hash_bytes(b"a"), hash_bytes(b"a"));
        assert_ne!(hash_bytes(b"a"), hash_bytes(b"b"));
    }
}
