## 처음 열기 (서명하지 않은 앱)

아직 서명과 공증을 하지 않아 운영체제가 처음 한 번 막는다. 받은 파일은 `SHA256SUMS.txt` 로 확인할 수 있다.

- **macOS** (Apple Silicon): dmg 를 열어 InitialEditor 를 응용 프로그램 폴더로 옮긴다. 처음 열 때 막히면 시스템 설정 > 개인정보 보호 및 보안에서 "그래도 열기". 또는 터미널에서 `xattr -dr com.apple.quarantine /Applications/InitialEditor.app`
- **Windows**: 설치 파일을 열면 SmartScreen 이 막는다. "추가 정보" 를 눌러 "실행". 앱에 엔진 실행 파일이 없어 F5 는 에디터 안(웹 엔진)에서 돈다
- **Linux**: AppImage 는 `chmod +x InitialEditor_*.AppImage` 뒤 실행 (FUSE 2 가 필요하다). deb 는 `sudo apt install ./InitialEditor_*.deb`
