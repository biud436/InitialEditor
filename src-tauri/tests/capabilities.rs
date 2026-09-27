// 프런트 권한(capabilities/default.json)이 넓어지지 않았는지 (docs/plans/e6-packaging.md 2.1 절, 7.4 절).
// 파일과 프로세스는 셸의 명령만 거치므로 fs, shell 플러그인은 열지 않고, opener 는 open_url 하나를 정한 주소로만 연다.

use serde_json::Value;

fn capability() -> Value {
    let path = concat!(env!("CARGO_MANIFEST_DIR"), "/capabilities/default.json");
    serde_json::from_str(&std::fs::read_to_string(path).unwrap()).unwrap()
}

fn identifiers(cap: &Value) -> Vec<String> {
    cap["permissions"]
        .as_array()
        .unwrap()
        .iter()
        .map(|p| match p {
            Value::String(s) => s.clone(),
            other => other["identifier"].as_str().unwrap().to_string(),
        })
        .collect()
}

#[test]
fn no_fs_or_shell_plugin_and_no_default_opener() {
    let ids = identifiers(&capability());
    for id in &ids {
        assert!(!id.starts_with("fs:"), "{id}");
        assert!(!id.starts_with("shell:"), "{id}");
    }
    let opener: Vec<&String> = ids.iter().filter(|id| id.starts_with("opener:")).collect();
    assert_eq!(
        opener,
        vec!["opener:allow-open-url"],
        "opener 는 open_url 하나만"
    );
}

#[test]
fn opener_urls_are_the_authors_github_and_the_web_edition() {
    let cap = capability();
    let entry = cap["permissions"]
        .as_array()
        .unwrap()
        .iter()
        .find(|p| p["identifier"] == "opener:allow-open-url")
        .expect("opener:allow-open-url 에 주소 범위가 있어야 한다");
    let urls: Vec<&str> = entry["allow"]
        .as_array()
        .unwrap()
        .iter()
        .map(|u| u["url"].as_str().unwrap())
        .collect();
    assert_eq!(
        urls,
        vec![
            "https://github.com/biud436/*",
            "https://initial-editor.biud436.com/*"
        ]
    );
    assert!(entry.get("deny").is_none());
}
