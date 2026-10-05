# 설치와 첫 실행

InitialEditor는 두 가지 형태로 제공됩니다.

- **데스크톱 앱**: 운영체제에 설치하는 프로그램입니다. 엔진 실행 파일이 함께 들어 있고, 프로젝트 폴더를 직접 읽고 씁니다.
- **웹판**: 브라우저에서 실행되는 같은 에디터입니다. 엔진은 WebAssembly 빌드로 페이지 안에서 실행되고, 프로젝트 폴더는 브라우저의 파일 시스템 접근 기능(File System Access API)으로 엽니다.

| | 데스크톱 앱 | 웹판 |
|---|---|---|
| 설치 | 필요 | 필요 없음 (Chrome, Edge) |
| 게임 실행 | 엔진 프로세스(별도 창) 또는 게임 탭 | 게임 탭 |
| 프로젝트 폴더 | 직접 열기, 외부 변경 감지 | 브라우저 권한으로 열기 |
| Lua 언어 서버(LuaLS) | 있음 | 없음 (구문 분석기만 동작) |
| 안드로이드 스테이징 | 있음 | 없음 |

## 데스크톱 앱 설치

[릴리스 페이지](https://github.com/biud436/InitialEditor/releases)에서 운영체제에 맞는 파일을 받습니다.

| 운영체제 | 파일 |
|---|---|
| macOS (Apple Silicon) | `InitialEditor_*.dmg` |
| Windows | `InitialEditor_*-setup.exe` |
| Linux | `InitialEditor_*.AppImage` 또는 `InitialEditor_*.deb` |

엔진은 앱에 포함되어 있습니다. Windows 판에는 엔진 실행 파일이 포함되어 있지 않으므로, 게임은 게임 탭(웹 엔진)에서 실행됩니다.

### 실행이 차단되는 경우

이 앱은 코드 서명이 되어 있지 않습니다. 따라서 처음 실행할 때 운영체제가 실행을 차단합니다. 받은 파일이 배포된 파일과 같은지는 릴리스의 `SHA256SUMS.txt`에 적힌 해시로 확인합니다.

- **macOS**: dmg를 열고 InitialEditor를 응용 프로그램 폴더로 옮깁니다. 실행이 차단되면 시스템 설정 > 개인정보 보호 및 보안에서 "그래도 열기"를 누릅니다. 또는 터미널에서 다음 명령으로 격리 속성을 제거합니다.

  ```sh
  xattr -dr com.apple.quarantine /Applications/InitialEditor.app
  ```

- **Windows**: SmartScreen 창에서 "추가 정보", "실행"을 차례로 누릅니다.
- **Linux**: AppImage 파일에 실행 권한을 주고 실행합니다. FUSE 2가 필요합니다.

  ```sh
  chmod +x InitialEditor_*.AppImage
  ./InitialEditor_*.AppImage
  ```

  deb 패키지는 `sudo apt install ./InitialEditor_*.deb`로 설치합니다.

> **주의**: 격리 속성 제거나 SmartScreen 우회는 운영체제의 확인 절차를 건너뛰는 것입니다. 릴리스 페이지에서 받은 파일인지, 해시가 일치하는지 먼저 확인합니다.

## 웹판

Chrome 또는 Edge에서 [initial-editor.biud436.com](https://initial-editor.biud436.com/)을 엽니다. 시작 화면의 항목은 다음과 같습니다.

| 항목 | 동작 |
|---|---|
| 폴더 열기 | 컴퓨터의 프로젝트 폴더를 엽니다. 브라우저가 폴더 읽기, 쓰기 권한을 요청합니다 |
| 새 프로젝트 | 선택한 빈 폴더에 템플릿으로 프로젝트를 만듭니다 |
| 샘플 프로젝트 열기 | RPG 데모 프로젝트를 브라우저 메모리에 만들어 엽니다 |

> **주의**: 샘플 프로젝트는 브라우저 메모리에만 존재합니다. 페이지를 새로 고치거나 닫으면 변경한 내용이 모두 사라집니다.

> **주의**: Safari와 Firefox는 File System Access API를 지원하지 않습니다. 이 브라우저에서는 폴더를 열 수 없고 샘플 프로젝트만 사용할 수 있습니다.

## 다음 문서

[첫 프로젝트](first-project.md)
