// I2DH 인코딩이 엔진 저장소의 인코더(tools/bridge/lib/hmr.js)와 같은 바이트를 내는지 확인한다.
// 픽스처는 scripts/gen-i2dh-fixture.mjs 가 만든다 (bin 은 엔진 인코더의 출력, json 은 그 입력).

use base64::Engine as _;
use initial_editor_lib::hmr::{decode_bundle, encode_bundle, HmrFile};

#[derive(serde::Deserialize)]
struct FixtureFile {
    path: String,
    #[serde(rename = "dataBase64")]
    data_base64: String,
}

#[derive(serde::Deserialize)]
struct Fixture {
    files: Vec<FixtureFile>,
}

fn load() -> (Vec<HmrFile>, Vec<u8>) {
    let dir = std::path::Path::new(env!("CARGO_MANIFEST_DIR"))
        .join("tests")
        .join("fixtures");
    let json = std::fs::read_to_string(dir.join("i2dh_sample.json")).expect("i2dh_sample.json");
    let fixture: Fixture = serde_json::from_str(&json).unwrap();
    let files = fixture
        .files
        .into_iter()
        .map(|f| HmrFile {
            path: f.path,
            data: base64::engine::general_purpose::STANDARD
                .decode(f.data_base64)
                .unwrap(),
        })
        .collect();
    let bin = std::fs::read(dir.join("i2dh_sample.bin")).expect("i2dh_sample.bin");
    (files, bin)
}

#[test]
fn encoding_matches_engine_encoder_byte_for_byte() {
    let (files, expected) = load();
    assert_eq!(files.len(), 4);
    assert_eq!(encode_bundle(&files), expected);
}

#[test]
fn engine_bundle_decodes_to_the_same_files() {
    let (files, bin) = load();
    let decoded = decode_bundle(&bin).unwrap();
    assert_eq!(decoded.len(), files.len());
    for (a, b) in decoded.iter().zip(files.iter()) {
        assert_eq!(a.path, b.path);
        assert_eq!(a.data, b.data);
    }
    // 한글 경로, 빈 파일, 0..255 전부가 든 바이너리가 픽스처에 있다
    assert!(files.iter().any(|f| f.path.contains("한글")));
    assert!(files.iter().any(|f| f.data.is_empty()));
    assert!(files
        .iter()
        .any(|f| f.data.len() == 256 && f.data.iter().enumerate().all(|(i, b)| *b as usize == i)));
}
