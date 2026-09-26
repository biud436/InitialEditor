// 엔진 HotReloadServer(TCP, 기본 127.0.0.1:5959)로 I2DH 번들을 보낸다.
// 인코딩은 엔진 저장소 tools/bridge/lib/hmr.js 의 encodeBundle 과 같다:
//   "I2DH" | u32 fileCount | (u32 pathLen | path(UTF-8) | u32 dataLen | data)*   정수는 전부 리틀 엔디언
// 엔진(src/platform/HotReloadServer.cpp)은 번들을 다 읽으면 "OK\n" 또는 "ER\n" 세 바이트로 답하고 연결을 닫는다.
// tests/i2dh_fixture.rs 가 엔진 인코더로 만든 바이트와 같은지 확인한다.
//
// 파일 내용은 JSON 안에서 base64 문자열로 온다 (Uint8Array 를 JSON 숫자 배열로 보내면 네 배로 커진다).

use std::io::{self, Read, Write};
use std::net::{TcpStream, ToSocketAddrs};
use std::time::Duration;

use base64::Engine as _;
use serde::{Deserialize, Deserializer, Serialize};

use crate::error::{BackendError, ErrorCode, Result};

pub const MAGIC: &[u8; 4] = b"I2DH";
pub const CONNECT_TIMEOUT: Duration = Duration::from_secs(2);
pub const REPLY_TIMEOUT: Duration = Duration::from_secs(10);

#[derive(Debug, Clone, Deserialize)]
pub struct HmrFile {
    pub path: String,
    #[serde(deserialize_with = "bytes_from_base64")]
    pub data: Vec<u8>,
}

fn bytes_from_base64<'de, D: Deserializer<'de>>(d: D) -> std::result::Result<Vec<u8>, D::Error> {
    let text = String::deserialize(d)?;
    base64::engine::general_purpose::STANDARD
        .decode(text.as_bytes())
        .map_err(serde::de::Error::custom)
}

#[derive(Debug, Clone, Serialize)]
pub struct PushResult {
    pub count: usize,
}

pub fn encode_bundle(files: &[HmrFile]) -> Vec<u8> {
    let total: usize = files.iter().map(|f| 8 + f.path.len() + f.data.len()).sum();
    let mut out = Vec::with_capacity(8 + total);
    out.extend_from_slice(MAGIC);
    out.extend_from_slice(&(files.len() as u32).to_le_bytes());
    for file in files {
        out.extend_from_slice(&(file.path.len() as u32).to_le_bytes());
        out.extend_from_slice(file.path.as_bytes());
        out.extend_from_slice(&(file.data.len() as u32).to_le_bytes());
        out.extend_from_slice(&file.data);
    }
    out
}

/// 테스트와 디버깅용 디코더 (엔진과 같은 규칙)
pub fn decode_bundle(bytes: &[u8]) -> std::result::Result<Vec<HmrFile>, String> {
    let mut at = 0usize;
    let take = |at: &mut usize, n: usize| -> std::result::Result<&[u8], String> {
        if *at + n > bytes.len() {
            return Err("truncated bundle".into());
        }
        let slice = &bytes[*at..*at + n];
        *at += n;
        Ok(slice)
    };
    let u32_at = |at: &mut usize| -> std::result::Result<usize, String> {
        let b = take(at, 4)?;
        Ok(u32::from_le_bytes([b[0], b[1], b[2], b[3]]) as usize)
    };
    if take(&mut at, 4)? != MAGIC {
        return Err("bad magic".into());
    }
    let count = u32_at(&mut at)?;
    let mut files = Vec::with_capacity(count);
    for _ in 0..count {
        let path_len = u32_at(&mut at)?;
        let path =
            String::from_utf8(take(&mut at, path_len)?.to_vec()).map_err(|e| e.to_string())?;
        let data_len = u32_at(&mut at)?;
        let data = take(&mut at, data_len)?.to_vec();
        files.push(HmrFile { path, data });
    }
    if at != bytes.len() {
        return Err("trailing bytes in bundle".into());
    }
    Ok(files)
}

fn unreachable(host: &str, port: u16, detail: impl std::fmt::Display) -> BackendError {
    BackendError::new(
        ErrorCode::HmrUnreachable,
        format!("엔진 핫 리로드 서버({host}:{port})에 닿을 수 없다: {detail}. 게임이 INITIAL2D_HMR=1 로 실행 중인지 확인"),
    )
}

fn socket_error(host: &str, port: u16, err: io::Error) -> BackendError {
    match err.kind() {
        io::ErrorKind::TimedOut | io::ErrorKind::WouldBlock | io::ErrorKind::ConnectionRefused => {
            unreachable(host, port, err)
        }
        _ => BackendError::new(
            ErrorCode::Io,
            format!("핫 리로드 전송 실패 ({host}:{port}): {err}"),
        ),
    }
}

/// 번들을 보내고 응답을 기다린다. OK 면 보낸 파일 수를 돌려준다.
pub fn push(host: &str, port: u16, files: &[HmrFile]) -> Result<PushResult> {
    if files.is_empty() {
        return Err(BackendError::new(ErrorCode::Io, "보낼 파일이 없다"));
    }
    let payload = encode_bundle(files);
    let addrs: Vec<_> = (host, port)
        .to_socket_addrs()
        .map_err(|e| {
            BackendError::new(
                ErrorCode::Network,
                format!("주소를 풀 수 없다 {host}:{port}: {e}"),
            )
        })?
        .collect();
    if addrs.is_empty() {
        return Err(BackendError::new(
            ErrorCode::Network,
            format!("주소를 풀 수 없다 {host}:{port}"),
        ));
    }
    let mut last_err: Option<io::Error> = None;
    let mut stream: Option<TcpStream> = None;
    for addr in &addrs {
        match TcpStream::connect_timeout(addr, CONNECT_TIMEOUT) {
            Ok(s) => {
                stream = Some(s);
                break;
            }
            Err(e) => last_err = Some(e),
        }
    }
    let mut stream = match stream {
        Some(s) => s,
        None => {
            let detail = last_err
                .map(|e| e.to_string())
                .unwrap_or_else(|| "connect failed".into());
            return Err(unreachable(host, port, detail));
        }
    };
    let _ = stream.set_nodelay(true);
    let _ = stream.set_write_timeout(Some(REPLY_TIMEOUT));
    let _ = stream.set_read_timeout(Some(REPLY_TIMEOUT));
    stream
        .write_all(&payload)
        .map_err(|e| socket_error(host, port, e))?;

    let mut reply = Vec::with_capacity(3);
    let mut buf = [0u8; 3];
    while reply.len() < 3 {
        match stream.read(&mut buf) {
            Ok(0) => break,
            Ok(n) => reply.extend_from_slice(&buf[..n]),
            Err(e) => return Err(socket_error(host, port, e)),
        }
    }
    match reply.as_slice() {
        b"OK\n" => Ok(PushResult { count: files.len() }),
        b"ER\n" => Err(BackendError::new(
            ErrorCode::Io,
            "엔진이 번들을 거부했다 (ER)",
        )),
        other => Err(BackendError::new(
            ErrorCode::Io,
            format!(
                "엔진 응답을 알 수 없다: {:?}",
                String::from_utf8_lossy(other)
            ),
        )),
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::net::TcpListener;
    use std::thread;

    fn files() -> Vec<HmrFile> {
        vec![
            HmrFile {
                path: "scripts/main.lua".into(),
                data: b"print(1)".to_vec(),
            },
            HmrFile {
                path: "scripts/한글.lua".into(),
                data: Vec::new(),
            },
        ]
    }

    #[test]
    fn encodes_header_like_hmr_js() {
        let encoded = encode_bundle(&files());
        assert_eq!(&encoded[..4], b"I2DH");
        assert_eq!(
            u32::from_le_bytes([encoded[4], encoded[5], encoded[6], encoded[7]]),
            2
        );
        let decoded = decode_bundle(&encoded).unwrap();
        assert_eq!(decoded.len(), 2);
        assert_eq!(decoded[0].path, "scripts/main.lua");
        assert_eq!(decoded[0].data, b"print(1)");
        assert_eq!(decoded[1].path, "scripts/한글.lua");
        assert!(decoded[1].data.is_empty());
        assert!(decode_bundle(&encoded[..encoded.len() - 1]).is_err());
        assert!(decode_bundle(b"NOPE").is_err());
    }

    #[test]
    fn base64_data_field_is_decoded() {
        let json = r#"[{"path":"scripts/a.lua","data":"cHJpbnQoMSk="},{"path":"b","data":""}]"#;
        let parsed: Vec<HmrFile> = serde_json::from_str(json).unwrap();
        assert_eq!(parsed[0].data, b"print(1)");
        assert!(parsed[1].data.is_empty());
        assert!(serde_json::from_str::<Vec<HmrFile>>(r#"[{"path":"a","data":"@@@"}]"#).is_err());
    }

    /// 아무도 듣지 않는 포트: 잠깐 열었다 닫아 번호만 얻는다
    fn free_port() -> u16 {
        let listener = TcpListener::bind("127.0.0.1:0").unwrap();
        listener.local_addr().unwrap().port()
    }

    /// 엔진 HotReloadServer 흉내: 번들을 끝까지 읽고 정해진 답을 보낸다
    fn fake_engine(reply: &'static [u8]) -> (u16, thread::JoinHandle<Vec<u8>>) {
        let listener = TcpListener::bind("127.0.0.1:0").unwrap();
        let port = listener.local_addr().unwrap().port();
        let handle = thread::spawn(move || {
            let (mut socket, _) = listener.accept().unwrap();
            let mut header = [0u8; 8];
            socket.read_exact(&mut header).unwrap();
            let count = u32::from_le_bytes([header[4], header[5], header[6], header[7]]);
            let mut body = header.to_vec();
            for _ in 0..count {
                let mut len = [0u8; 4];
                socket.read_exact(&mut len).unwrap();
                let mut path = vec![0u8; u32::from_le_bytes(len) as usize];
                socket.read_exact(&mut path).unwrap();
                socket.read_exact(&mut len).unwrap();
                let mut data = vec![0u8; u32::from_le_bytes(len) as usize];
                socket.read_exact(&mut data).unwrap();
                body.extend_from_slice(&[len[0], len[1], len[2], len[3]]);
                body.extend_from_slice(&path);
                body.extend_from_slice(&len);
                body.extend_from_slice(&data);
            }
            socket.write_all(reply).unwrap();
            body
        });
        (port, handle)
    }

    #[test]
    fn nothing_listening_is_hmr_unreachable() {
        let port = free_port();
        let err = push("127.0.0.1", port, &files()).unwrap_err();
        assert_eq!(err.code, ErrorCode::HmrUnreachable, "{err:?}");
    }

    #[test]
    fn ok_reply_counts_files() {
        let (port, server) = fake_engine(b"OK\n");
        let result = push("127.0.0.1", port, &files()).unwrap();
        assert_eq!(result.count, 2);
        // 서버가 받은 바이트가 인코딩과 같은지 (경로 길이 자리까지 다시 조립했으므로 길이만 비교)
        let received = server.join().unwrap();
        assert_eq!(received.len(), encode_bundle(&files()).len());
    }

    #[test]
    fn er_reply_is_io_error() {
        let (port, server) = fake_engine(b"ER\n");
        let err = push("127.0.0.1", port, &files()).unwrap_err();
        assert_eq!(err.code, ErrorCode::Io);
        server.join().unwrap();
    }

    #[test]
    fn closing_without_reply_is_io_error() {
        let (port, server) = fake_engine(b"");
        let err = push("127.0.0.1", port, &files()).unwrap_err();
        assert_eq!(err.code, ErrorCode::Io);
        server.join().unwrap();
    }

    #[test]
    fn empty_bundle_is_rejected_before_connecting() {
        assert_eq!(push("127.0.0.1", 1, &[]).unwrap_err().code, ErrorCode::Io);
    }
}
