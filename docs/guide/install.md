# 설치와 첫 실행

InitialEditor는 두 가지 형태로 씁니다.

| | 데스크톱 앱 | 웹판 |
|---|---|---|
| 설치 | 필요 | 필요 없음 (Chrome, Edge) |
| 게임 실행 | 엔진 프로세스(별도 창) 또는 에디터 안 게임 탭 | 에디터 안 게임 탭 |
| 프로젝트 폴더 | 직접 열기, 파일 변경 감시 | 브라우저가 권한을 받아 열기 |
| 언어 서버(LuaLS) | 있음 | 없음 (구문 분석기만) |
| 안드로이드 스테이징 | 있음 | 없음 |

처음에는 데스크톱 앱을 권합니다. 웹판은 설치 없이 잠깐 살펴볼 때 좋습니다.

## 데스크톱 앱 설치

[릴리스 페이지](https://github.com/biud436/InitialEditor/releases)에서 운영체제에 맞는 파일을 받습니다.

| 운영체제 | 파일 |
|---|---|
| macOS (Apple Silicon) | `InitialEditor_*.dmg` |
| Windows | `InitialEditor_*-setup.exe` |
| Linux | `InitialEditor_*.AppImage` 또는 `InitialEditor_*.deb` |

앱에는 엔진이 들어 있어 따로 받을 것이 없습니다. Windows 판에는 엔진 실행 파일이 없어서 게임은 에디터 안 게임 탭에서 실행됩니다.

### 처음 열 때 차단되면

앱에 아직 코드 서명이 없어서 운영체제가 처음 실행을 막습니다. 받은 파일이 맞는지는 릴리스의 `SHA256SUMS.txt`로 확인할 수 있습니다.

- **macOS**: dmg를 열고 InitialEditor를 응용 프로그램 폴더로 옮깁니다. 처음 실행이 막히면 시스템 설정 > 개인정보 보호 및 보안에서 "그래도 열기"를 누릅니다. 또는 터미널에서 다음을 실행합니다.

  ```sh
  xattr -dr com.apple.quarantine /Applications/InitialEditor.app
  ```

- **Windows**: SmartScreen 창에서 "추가 정보"를 누른 뒤 "실행"을 누릅니다.
- **Linux**: AppImage에 실행 권한을 주고 실행합니다 (FUSE 2 필요).

  ```sh
  chmod +x InitialEditor_*.AppImage
  ./InitialEditor_*.AppImage
  ```

  deb 패키지는 `sudo apt install ./InitialEditor_*.deb`로 설치합니다.

## 웹판

[initial-editor.biud436.com](https://initial-editor.biud436.com/)을 Chrome이나 Edge로 엽니다. 시작 화면에서 다음 셋 중 하나를 선택합니다.

- **폴더 열기**: 컴퓨터에 있는 프로젝트 폴더를 엽니다. 브라우저가 폴더 읽기와 쓰기 권한을 묻습니다.
- **새 프로젝트**: 빈 폴더를 선택하고 템플릿으로 프로젝트를 만듭니다.
- **샘플 프로젝트 열기**: RPG 데모를 브라우저 메모리에 열어 바로 써 봅니다. 페이지를 다시 열면 처음 상태로 돌아갑니다.

Safari와 Firefox는 폴더 열기를 지원하지 않아 샘플 프로젝트로만 시작합니다.

## 다음 단계

[첫 프로젝트](first-project.md)에서 프로젝트를 만들고 실행해 봅니다.
