// 파일 쓰기 보조: 원자적 쓰기, 내용 해시, 뮤텍스 잠금.
//
// 원자적 쓰기는 같은 폴더의 임시 파일(`.<이름>.tmp-<pid>-<시각>-<번호>`)에 전부 쓴 뒤 rename 한다.
// rename 은 같은 파일 시스템 안에서 원자적이라 실행 중인 게임이나 다른 프로세스가 반쯤 쓰인 파일을
// 읽는 일이 없다. 브리지 서버(tools/bridge/lib/files.js)와 같은 방식이고 fsync 는 하지 않는다
// (전원 차단 내구성이 아니라 동시 읽기 안전이 목적이다).

use std::fs;
use std::io::{self, Write};
use std::path::Path;
use std::sync::atomic::{AtomicU64, Ordering};
use std::sync::{Mutex, MutexGuard};
use std::time::{SystemTime, UNIX_EPOCH};

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
        fs::rename(&tmp, abs)
    })();
    if result.is_err() {
        let _ = fs::remove_file(&tmp);
    }
    result
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
    fn hash_is_stable() {
        assert_eq!(hash_bytes(b""), 0xcbf2_9ce4_8422_2325);
        assert_eq!(hash_bytes(b"a"), hash_bytes(b"a"));
        assert_ne!(hash_bytes(b"a"), hash_bytes(b"b"));
    }
}
