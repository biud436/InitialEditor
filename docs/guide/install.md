# 설치와 첫 실행

InitialEditor는 데스크톱 앱과 웹판, 두 가지로 쓸 수 있습니다.

| | 데스크톱 앱 | 웹판 |
|---|---|---|
| 설치 | 필요 | 필요 없음 (Chrome, Edge) |
| 게임 실행 | 별도 창(엔진 프로세스) 또는 에디터 안의 게임 탭 | 에디터 안의 게임 탭 |
| 프로젝트 폴더 | 바로 열고, 바깥에서 바뀐 파일도 감지 | 브라우저에서 권한을 받아 열기 |
| 언어 서버(LuaLS) | 있음 | 없음 (구문 분석기만 사용) |
| 안드로이드 스테이징 | 있음 | 없음 |

제대로 쓰려면 데스크톱 앱을 권합니다. 웹판은 설치하지 않고 잠깐 둘러볼 때 좋습니다.

## 데스크톱 앱 설치

[릴리스 페이지](https://github.com/biud436/InitialEditor/releases)에서 운영체제에 맞는 파일을 받습니다.

| 운영체제 | 파일 |
|---|---|
| macOS (Apple Silicon) | `InitialEditor_*.dmg` |
| Windows | `InitialEditor_*-setup.exe` |
| Linux | `InitialEditor_*.AppImage` 또는 `InitialEditor_*.deb` |

엔진은 앱에 들어 있어서 따로 설치하지 않아도 됩니다. 다만 Windows 판에는 엔진 실행 파일이 없어서, 게임은 에디터 안의 게임 탭에서 실행됩니다.

### 처음 실행이 막힐 때

아직 코드 서명을 하지 않은 앱이라 처음 실행할 때 운영체제가 막습니다. 받은 파일이 맞는지는 릴리스에 있는 `SHA256SUMS.txt`로 확인할 수 있습니다.

- **macOS**: dmg를 열어 InitialEditor를 응용 프로그램 폴더로 옮깁니다. 실행이 막히면 시스템 설정 > 개인정보 보호 및 보안에서 "그래도 열기"를 누르세요. 터미널에서 아래 명령을 실행해도 됩니다.

  ```sh
  xattr -dr com.apple.quarantine /Applications/InitialEditor.app
  ```

- **Windows**: SmartScreen 창이 뜨면 "추가 정보"를 누르고 "실행"을 누르세요.
- **Linux**: AppImage에 실행 권한을 준 뒤 실행합니다. FUSE 2가 필요합니다.

  ```sh
  chmod +x InitialEditor_*.AppImage
  ./InitialEditor_*.AppImage
  ```

  deb 패키지는 `sudo apt install ./InitialEditor_*.deb`로 설치합니다.

## 웹판

Chrome이나 Edge에서 [initial-editor.biud436.com](https://initial-editor.biud436.com/)을 엽니다. 시작 화면에는 세 가지 버튼이 있습니다.

- **폴더 열기**: 내 컴퓨터의 프로젝트 폴더를 엽니다. 브라우저가 폴더를 읽고 쓸 권한을 물어봅니다.
- **새 프로젝트**: 빈 폴더를 고르면 템플릿으로 프로젝트를 만들어 줍니다.
- **샘플 프로젝트 열기**: 아무것도 준비하지 않고 RPG 데모를 바로 열어 봅니다. 샘플은 브라우저 메모리에만 있어서, 페이지를 다시 열면 처음 상태로 돌아갑니다.

Safari와 Firefox는 폴더 열기를 지원하지 않기 때문에 샘플 프로젝트로만 시작할 수 있습니다.

## 다음 단계

[첫 프로젝트](first-project.md)로 넘어가 프로젝트를 만들고 실행해 보세요.
