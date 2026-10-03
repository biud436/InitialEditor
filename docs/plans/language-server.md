# 언어 서버: 스크립트 에디터가 코드를 이해한다

> 작성일: 2026-10-03. 이슈 [#53](https://github.com/biud436/InitialEditor/issues/53)(스크립트 에디터의 언어 서버)을 구체화한 계획이고 단계 0, 1, 2를 했다.
> [next-goals.md](next-goals.md)의 머리에 적은 "에디터를 끝낸 뒤의 목표" 중 하나다. 엔진 쪽 짝은 엔진 저장소 `docs/plans/r2-api-stubs.md` 10절(R2-B)이다.

## 1. 목표 (한 문장)

**데스크톱 앱에서 Lua 스크립트를 열면 앱에 든 LuaLS 가 붙어, 지역 변수와 `require` 한 모듈과 사용자 함수까지 아는 자동 완성,
진단, 정의로 이동, 참조, 이름 바꾸기가 된다. Ruby 스크립트와 브라우저판의 Lua 는 워커 안의 구문 분석기가 구문 오류, 문서 기호,
프로젝트 안의 정의 찾기를 맡는다.** 지금까지의 완성은 엔진 API 명세와 커서 앞 한 줄의 정규식으로 만들어서
(`completionModel.ts`) 사용자가 만든 것은 몰랐고, 문법 오류는 게임을 돌려야 보였다.

## 2. 결정

이슈의 "정할 것" 다섯에 대한 답이다. 저자가 "완성을 향해 정진, 또 정진하라"고 해서 되돌리기 쉬운 쪽으로 정했다 (2026-10-03).
저자가 달리 정하면 그 말이 이긴다.

| 정할 것 | 결정 | 이유 |
|---|---|---|
| 1. LuaLS 와 emmylua_ls | **LuaLS 3.19.1** | 오탐이 적다. emmylua_ls 는 0.x 판이고 엔진 코드에서 `call-non-callable` 183건을 냈다. 폴더째 싣는 부담은 잘라 내서 줄였다 (3절: 파일 278개, 2.8 MB) |
| 2. 진단의 기본 세기 | **규칙 목록.** LuaLS 기본에서 형식 검사(`type-check`), 지역 변수 다시 선언(`redefined`), 줄 끝 공백(`trailing-space`)을 끈다. 설정에서 끔, 구문 오류만, 규칙 전체를 고른다 | 기본 규칙으로 엔진 스크립트를 읽으면 591건이고 셋을 끄면 경고 이상이 0건이다 (엔진 R2-B). 규칙의 원본은 엔진 템플릿의 `.luarc.json` 하나다 |
| 3. Ruby 를 어디까지 | **워커 수준(단계 2)까지.** 설치된 Ruby 연결(단계 3)은 하지 않는다 | Ruby 언어 서버는 모두 CRuby 3 이상이 필요하다. 단계 2는 같은 날 했다 (8절) |
| 4. 브리지에도 LuaLS | **붙이지 않는다.** 브리지는 워커(단계 2)만 쓴다 | 브리지에는 프로세스를 띄우는 코드가 없고, 브리지는 개발용이다 |
| 5. 단계 0을 지금 | **했다.** 엔진 PR #65, 프리릴리스 `v2.0.0-alpha.4` | 생성기와 템플릿 목록만 고치면 되고, 새 프로젝트가 스텁과 `.luarc.json` 을 받아야 단계 1의 진단이 깨끗하다 |

그 밖에 정한 것:

- **monaco-languageclient 를 쓰지 않는다** (이슈 단계 1 그대로). LSP 응답을 Monaco 공급자로 옮기는 어댑터를 직접 썼다 (4.3절).
  `vscode-languageserver-protocol` 은 타입만 쓰고 번들에 들어가지 않는다.
- **문서 동기화는 언제나 전체 글이다.** 바뀐 글을 150 ms 모았다가 보내고, 요청 직전에는 먼저 보낸다. 증분 동기화는 Monaco 의 변경 묶음 순서를 맞춰야 해서
  얻는 것에 비해 틀릴 자리가 많다. 스크립트 크기에서는 차이가 없다.
- **서버를 띄우는 방법은 `ServerLauncher` 하나로 감춘다.** 데스크톱은 앱에 든 LuaLS, e2e 는 시험 프로세스가 띄운 LuaLS 이고, 단계 2의 워커도 같은 자리에 붙는다.
- **단계 2는 언어마다 워커 하나다.** Lua 는 luaparse 0.3.1(Lua 5.3 문법), Ruby 는 Prism 1.9.0(wasm, WASI 는 `@bjorn3/browser_wasi_shim`)이다.
  워커는 에디터의 `RpcConnection` 을 서버 쪽으로도 쓰고(`vscode-languageserver` 를 싣지 않는다), 디스크를 모르므로 서버가 보는 루트는 `/project` 이고
  파일은 에디터가 `initial/workspaceFiles` 와 `initial/readFile` 로 준다. 색인은 `scripts/` 아래만 본다 (엔진 API 스텁은 명세 공급자의 몫이다).
- **프로젝트에 스텁이 없으면 앱에 든 스텁을 쓴다.** 이 변경 전에 만든 프로젝트에는 `resources/api/initial2d.lua` 가 없어서, 그대로 두면 엔진 API 를 부르는
  줄마다 `undefined-global` 이 뜬다. 셸이 번들의 스텁을 앱 캐시에 쓰고 그 경로를 `workspace.library` 로 준다.

## 3. 싣기

- `scripts/fetch-luals.mjs` (`yarn luals:fetch [--target <트리플>] [--from <압축>]`): LuaLS 릴리스의 대상별 압축을 받아 sha256 을 대조하고(값은 스크립트의 `LUALS`),
  `src-tauri/luals/` 에 푼다. `meta/3rd`(다른 엔진용 정의), `meta/spell`(맞춤법 사전), 미리 만든 메타 폴더(Lua 5.4 설정으로 만든 것), en-us 밖의 번역,
  변경 기록은 뺀다. macOS arm64 기준 1,211개 20 MB 가 278개 2.8 MB 가 된다. `luals.json` 에 판과 대상을 적는다. 받은 압축은 `src-tauri/target/luals-download/` 에 남긴다.
- 고지: 배포본의 `LICENSE` 를 `src-tauri/licenses/luals/LICENSE` 로 복사한다. 같은 폴더의 `NOTICE.md` 는 저장소에 있고, 실행 파일에 정적으로 묶인
  bee.lua(Lua 5.4 포함), lpeglabel, EmmyLuaCodeStyle, json.lua 의 MIT 원문을 싣는다 (LuaLS 3.19.1 의 서브모듈 커밋에서 받았다).
- `tauri.dist.conf.json` 의 `bundle.resources` 에 `luals/` 를 더했다. 배포 빌드 전에 `yarn luals:fetch` 가 필요하다. `release.yml` 의 번들 잡은 대상마다 받는다.
- 셸(`src-tauri/src/lsp.rs`, 명령은 `commands.rs`): `lsp_available`, `lsp_start(root, channel, library?)`, `lsp_send(id, text)`, `lsp_stop(id)`.
  - 실행 파일은 환경 변수 `INITIAL_EDITOR_LUALS`, 번들 리소스의 `luals/bin/`, 디버그 빌드면 `src-tauri/luals/bin/` 순서로 찾는다.
  - stdout 은 `Content-Length` 머리로 나눠(머리 줄 1 KiB, 본문 64 MiB 까지) 본문만 `tauri::ipc::Channel` 로 보낸다. 엔진 출력처럼 줄 단위 이벤트로 보내지 않는다.
  - 로그(`--logpath`)는 앱 로그 폴더, 생성 메타(`--metapath`)는 앱 캐시 폴더다. 설치 폴더는 읽기 전용일 수 있다.
  - 멈출 때는 입력을 닫고 1초 기다린 뒤 kill 한다. 앱이 끝날 때(`RunEvent::Exit`) 남은 서버를 모두 끝낸다. Windows 는 콘솔 창을 띄우지 않는다.
- 프런트 래퍼: `packages/backend-tauri/src/lsp.ts` 의 `lspAvailable`, `TauriLanguageServer` (메시지 단위의 전송).

## 4. 구조

`packages/app/src/editor/scripting/lsp/` 의 파일들이다.

### 4.1 JSON-RPC 와 클라이언트

- `rpc.ts`: 요청과 응답의 짝, 알림, 서버가 거는 요청에 답하기, `$/cancelRequest`. 전송이 닫히면 남은 요청은 실패로 끝난다.
- `client.ts`: `initialize` 와 `initialized`, 문서 열기와 바꾸기와 닫기, `workspace/configuration` 의 답, `workspace/didChangeWatchedFiles`, `shutdown` 과 `exit`.
  Monaco 를 모르므로 Node 에서도 돈다 (7절의 `yarn test:luals`).

### 4.2 경로와 URI

- `uri.ts`: 에디터의 모델은 `initial:/<프로젝트 상대 경로>` 이고 서버는 디스크의 절대 경로를 `file://` URI 로 본다. 경로 조각마다 percent 인코딩한다(한글과 공백).
  Windows 경로는 `file:///C:/...` 로 보내고, 서버가 드라이브 문자를 소문자로 하거나 콜론을 `%3A` 로 보내도 같은 경로로 읽는다. 루트 밖의 URI(LuaLS 의 표준 라이브러리 정의 등)는 버린다.

### 4.3 Monaco 연결

- `convert.ts`: LSP 값과 Monaco 값 사이의 순수 함수 (진단과 마커, 완성 항목, 호버, 시그니처, 위치, 같은 기호 강조, 문서 기호, 이름 바꾸기의 편집).
- `binding.ts`:
  - 언어가 Lua 인 `initial:` 모델을 열고, 바뀔 때마다 알리고, 닫는다. 같은 경로의 모델이 바뀌어 끼워지면(문서를 다시 읽을 때) 닫지 않는다.
  - 진단은 URI 마다 두었다가 마커로 건다. 표시 범위가 바뀌면 다시 건다.
  - 공급자: 완성(과 `completionItem/resolve`), 호버, 시그니처, 정의, 참조, 같은 기호 강조, 문서 기호, 이름 바꾸기(`prepareRename` 포함).
  - 다른 파일로의 정의 이동은 `registerEditorOpener` 로 에디터의 탭을 연다. 참조 미리보기와 이름 바꾸기는 다른 파일의 모델이 있어야 하므로, 결과에 든 파일 중
    모델이 없는 것은 디스크에서 읽어 만들어 둔다. 이름 바꾸기가 고칠 파일은 문서로 열어 저장할 수 있게 한다 (원래 탭으로 돌아온다).
- `monaco.ts` 는 기능을 골라 담으므로 정의로 이동(`goToCommands`, `goToDefinitionAtPosition`), 이름 바꾸기, 문서 기호, 기호로 이동(Ctrl+Shift+O)을 더했다.

### 4.4 수명

`LanguageServer.ts` 의 `ScriptLanguageServer` 가 언어마다 하나씩 `ScriptSupport.languageServer`(Lua)와 `rubyServer`(Ruby)로 붙는다.

- 서버를 띄우는 방법(`ServerLauncher`)은 차례대로 쓸 수 있는 첫 것을 고른다. Lua 는 데스크톱이면 앱에 든 LuaLS, 없으면(개발 빌드에서 받지 않았을 때) 분석기 워커, 그 밖의 실행 환경은 분석기 워커다. Ruby 는 언제나 분석기 워커다.
- 켜는 때: 설정 `languageServer` 가 켜져 있고, 프로젝트가 열려 있고, 그 언어의 모델이 처음 열릴 때. 맵만 칠하는 동안에는 서버를 띄우지 않는다.
- 끄는 때: 프로젝트를 닫거나 바꿀 때, 설정을 끌 때. 설정 객체는 바꿀 때마다 새로 만들어지므로 세 값을 얕게 견준다 (견주지 않으면 진단 범위만 바꿔도 서버가 다시 뜬다).
- 서버가 스스로 끝나면 1분 안에 한 번만 다시 띄우고, 또 끝나면 오류로 둔다. 도구 메뉴의 "언어 서버 다시 시작"이 다시 띄운다.
- LuaLS 가 도는 동안 Lua 의 명세 공급자는 씬 계약 스니펫(`Initialize`, `Update(elapsed)` 등)만 남긴다. 나머지는 서버가 주므로 같은 이름이 두 번 나오지 않는다.
  분석기 워커는 명세 공급자를 대신하지 않는다. 엔진 API 의 완성, 시그니처, 호버는 명세에서 오고, 워커는 지금 문서의 이름과 다른 파일의 클래스, 모듈, 상수 이름을
  완성에 더한다. 다른 파일의 함수는 더하지 않는다: 대개 받는 쪽을 붙여 부르고(`M.add`), 씬 파일마다 있는 씬 함수(`Update`, `update`)가 씬 계약 스니펫보다 앞에 놓인다.
- 상태: 끔, 없음, 대기, 시작 중, 실행 중(판), 오류. LuaLS 는 `serverInfo.version` 에 `<Unknown>` 을 보내므로 판은 배포본의 `luals.json` 에서 읽는다.

## 5. 설정과 진단

- 설정 `languageServer`(기본 켬)와 `scriptDiagnostics`(`off`, `syntax`, `rules`, 기본 `rules`). 설정 대화상자에서 서버를 띄울 수 있는 실행 환경일 때만 보인다.
- 서버가 묻는 설정의 `Lua` 갈래는 엔진 템플릿의 `.luarc.json`(번들의 `templates/resources/templates/luarc.json`)을 점 이름에서 겹친 객체로 바꾼 것에
  스텁의 절대 경로(`workspace.library`), `workspace.checkThirdParty: false`, `telemetry.enable: false`, `hint.enable: false` 를 더한 것이다 (`luaSettings.ts`).
- 프로젝트에 `.luarc.json` 이 있으면 LuaLS 는 그 파일을 이 답보다 먼저 쓴다. 새 프로젝트(Lua)는 템플릿의 같은 규칙을 받는다. VS Code 에서 열어도 진단이 같다.
- 구문 오류는 LuaLS 의 `source` 가 `Lua Syntax Check.` 인 것이다. 표시 범위의 "구문 오류만"은 이것만 마커로 건다.
- `.lua` 와 `.luarc.json` 의 디스크 변경은 `workspace/didChangeWatchedFiles` 로 알린다.

## 6. 화면

- 상태 바의 언어 서버 칸이 언어마다 하나다: `LuaLS 3.19.1`, `Lua 분석기 0.3.1`, `Ruby 분석기 1.9.0`, `시작 중`, `오류`(빨강). 툴팁에 맡은 기능과 이유가 있다.
- 도구 메뉴 "언어 서버 다시 시작" (두 언어 모두. 스크립트가 열려 있지 않은 언어는 열릴 때 시작한다).
- 설정 대화상자의 "언어 서버"(스크립트에 언어 서버 사용)와 "진단 표시"(표시 안 함, 구문 오류만, 규칙 전체). 분석기 워커는 구문 오류만 내므로 "구문 오류만"과 "규칙 전체"가 같다.

## 7. 시험

- 단위 (`yarn test`): `lsp/rpc.test.ts`(연결 6건, 클라이언트 5건), `lsp/convert.test.ts`(URI 3건, 변환 8건, 설정 2건), 설정의 새 값, 자가 검사의 언어 서버 단계(실행기 3건, 판정 1건),
  `fetch-luals.mjs` 의 인자와 거르기와 tar 읽기 (`tests/scripts/luals.unit.ts`).
- 진짜 LuaLS (`yarn test:luals`, `tests/luals/client.test.ts`): 앱의 `LanguageClient` 와 설정을 그대로 쓰고 전송만 Node 의 자식 프로세스다.
  1. RPG 템플릿으로 만든 새 프로젝트를 LuaLS 의 검사 모드로 읽으면 템플릿의 Lua 파일 전부(31개)에 경고 이상이 없다.
  2. 스텁도 `.luarc.json` 도 없는 프로젝트: 앱이 준 스텁과 설정으로 엔진 API 를 알고(`DrawText`, `Sprite`), 이름 오타(`undefined-global`), 인자 수(`missing-parameter`), 구문 오류를 잡는다.
  3. `Sprite.` 뒤 완성, 스텁의 한국어 호버, 다른 파일로의 정의와 참조, 두 파일에 걸친 이름 바꾸기, 문서 기호, 고친 글을 보낸 뒤의 진단 변화.
- e2e (`tests/e2e/language-server.spec.ts`, Chromium 과 WebKit): 메모리 프로젝트에 시험 프로세스의 LuaLS 를 `ServerLauncher` 로 잇는다. 상태 표시, 진단 마커와 표시 범위,
  `Sprite.SetPo` 의 완성이 서버의 항목 하나뿐인 것(명세 공급자와 겹치지 않음), 씬 계약 스니펫, F12 로 다른 파일의 탭 열기, F2 로 두 파일 이름 바꾸기(두 문서가 저장 안 됨),
  프로젝트를 닫으면 서버가 끝나는 것.
- 분석기 (`lsp/worker/analyzers.test.ts`, 9건): 바이트 위치와 낱말, Lua 함수 기호(메서드, 블록 안, 중첩)와 구문 오류의 자리, Lua 5.4 문법 거부,
  Ruby 기호(module, class, def, def self, class << self, 상수)와 한글 뒤 오류의 UTF-16 열, 템플릿의 Lua 와 Ruby 스크립트 전부가 오류 없음.
  워커 서버 (`lsp/worker/server.test.ts`, 5건): 클라이언트와 메모리 전송으로 짝지어 구문 오류의 발행과 지움, 작업 공간 색인과 다른 파일의 정의, 문서 기호,
  완성 이름(지금 문서의 이름만, 받는 쪽 뒤는 비움), 디스크 변경과 지움, 구문 오류가 난 글의 마지막 기호, 같은 문서 우선, shutdown 과 exit.
- e2e (`tests/e2e/analyzer-worker.spec.ts`, Chromium): 브라우저판에서 Ruby 의 Prism 구문 오류 마커와 지움, F12 로 다른 파일의 정의, 기호로 이동 목록.
  다른 파일의 모듈 이름(`Util`) 완성. Lua 의 luaparse 구문 오류, 명세 완성(`Input`)과 지금 문서의 이름(`wrap`)이 한 목록에, F12 로 다른 파일의 정의.
- Rust (`cargo test`): 머리 읽기와 쓰기(UTF-8 바이트 수, 깨진 스트림 다섯 가지), `cat` 으로 만든 메아리 서버의 왕복과 멈춤, 없는 실행 파일, `luals.json` 의 판.
- 설치본 자가 검사 (`release.yml`, 세 OS): 플래피 Lua 프로젝트에서 앱에 든 LuaLS 가 실행 중이 되고, 진입 스크립트의 `Json.` 뒤 완성에 `Load` 가 있고 호버에 `Load` 가 있다.
  계획의 `languageServer`, 보고서의 `languageServer`, 판정 `scripts/selftest-check.mjs`.
- CI: `ci.yml` 의 웹 잡이 `yarn luals:fetch` 뒤 `yarn test:luals` 와 e2e 를 돌린다. CI 에서 LuaLS 가 없으면 건너뛰지 않고 실패한다.

## 8. 체크리스트

### 단계 0. 명세에서 스텁과 설정 (엔진, 2026-10-03)

- [x] 생성기가 RBS(`initial2d.rbs`)와 `.luarc.json` 둘(새 프로젝트용, 엔진 저장소용)을 쓴다. `--check` 가 다섯 파일을 본다 (엔진 PR #65)
- [x] 템플릿 묶음에 스텁 셋과 LuaLS 설정. 엔진 `scripts/lua` 의 주석 11곳 정리, `tools/check_luals.sh`, CI `editor-stubs`
- [x] 엔진 프리릴리스 `v2.0.0-alpha.4`, 에디터 핀과 템플릿 동기화 (`.luarc.json`, `resources/api/initial2d.lua` 는 Lua, `initial2d.rb` 와 `.rbs` 는 Ruby 프로젝트에)
- [x] README(엔진): VS Code, Neovim, Zed 에서 LuaLS 쓰기

### 단계 1. 데스크톱 Lua: LuaLS (2026-10-03)

- [x] 싣기: `yarn luals:fetch`, 잘라 내기, `tauri.dist.conf.json`, 고지, `release.yml` 의 대상별 받기
- [x] 셸 `lsp.rs` 와 명령 넷, 앱 종료 때 정리
- [x] 클라이언트, 변환, Monaco 연결, 수명, 명세 공급자와의 나눔
- [x] 설정 둘, 상태 바, 다시 시작 커맨드, 스텁이 없는 프로젝트
- [x] 시험: 단위, `yarn test:luals`, e2e(Chromium, WebKit), Rust, 설치본 자가 검사

### 단계 2. 워커 분석기: 브라우저판과 Ruby (2026-10-03)

- [x] 워커 안의 작은 서버(`lsp/worker/server.ts`, 에디터의 `RpcConnection` 을 서버 쪽으로)를 `ServerLauncher` 로 잇기 (`lsp/worker/launcher.ts`)
- [x] Lua: `luaparse`(5.3) 구문 진단, 문서 기호, 프로젝트 색인으로 정의 찾기와 완성 이름 (브라우저판과 브리지, LuaLS 가 없는 데스크톱)
- [x] Ruby: `@ruby/prism` 구문 진단, 문서 기호, 색인 (세 실행 환경 모두)
- [x] 서버 관리자를 언어마다 하나로 (`ScriptLanguageServer`), 상태 바 칸 둘, 다시 시작은 두 언어

## 9. 남은 것

- 분석기 워커의 정의 찾기는 낱말의 끝 이름으로만 찾는다. `Util.add` 의 `add` 는 프로젝트의 모든 `add` 를 보이고(미리보기), `require` 와 상수 경로는 따라가지 않는다.
- 엔진의 mruby 4.0 은 자체 파서를 써서 Prism 과 드물게 판정이 다를 수 있다. mruby 4.1 부터는 Prism 이라 엔진이 올라가면 같은 파서가 된다.
- 설치된 Ruby 의 언어 서버(Solargraph, Steep) 연결(이슈의 단계 3, 선택)은 하지 않았다.
- 코드 액션(LuaLS 의 빠른 수정), 서식 맞추기, 인레이 힌트는 붙이지 않았다. 서식은 저자의 코드를 묻지 않고 바꿀 수 있어서 뺐다.
- 진단 메시지는 영어다 (LuaLS 에 한국어 번역이 없다).
- 모듈 함수의 오타(`Input.KeyDwon`)는 `undefined-field` 라 기본 규칙에서 잡지 않는다. 엔진의 게임 스크립트에서 이 규칙이 201건의 오탐을 내기 때문이다.
  프로젝트의 `.luarc.json` 에서 `type-check` 줄을 지우면 켜진다.
