## 처음 열기 (서명되지 않은 앱)

아직 서명과 공증을 하지 않아 운영체제가 처음 실행할 때 한 번 차단합니다. 받은 파일은 `SHA256SUMS.txt`로 확인할 수 있습니다.

- **macOS** (Apple Silicon): dmg를 열어 InitialEditor를 응용 프로그램 폴더로 옮깁니다. 처음 열 때 차단되면 시스템 설정 > 개인정보 보호 및 보안에서 "그래도 열기"를 선택하세요. 또는 터미널에서 `xattr -dr com.apple.quarantine /Applications/InitialEditor.app`을 실행하세요
- **Windows**: 설치 파일을 열면 SmartScreen이 차단합니다. "추가 정보"를 누른 다음 "실행"을 선택하세요. 앱에 엔진 실행 파일이 없어 F5는 게임 탭에서 웹 엔진으로 실행됩니다
- **Linux**: AppImage는 `chmod +x InitialEditor_*.AppImage`로 실행 권한을 준 뒤 여세요 (FUSE 2가 필요합니다). deb는 `sudo apt install ./InitialEditor_*.deb`로 설치하세요
