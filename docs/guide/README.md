# InitialEditor 설명서

InitialEditor는 Initial2D 엔진의 프로젝트를 편집하고 실행하는 프로그램입니다. 프로젝트의 씬 파일, 맵 파일, 스크립트, 설정 파일을 편집하고, 엔진을 실행해 결과를 확인합니다.

![맵 편집 화면](images/map-editor.png)

## 시작

1. [설치와 첫 실행](install.md): 데스크톱 앱과 웹판의 차이, 설치 방법
2. [첫 프로젝트](first-project.md): 템플릿으로 프로젝트를 만들고 실행하는 절차, 프로젝트 폴더 구조
3. [화면 구성](interface.md): 패널, 레이아웃, 메뉴, 설정
4. [용어](glossary.md): 이 설명서에서 쓰는 용어의 정의

## 기능별 설명

| 주제 | 문서 |
|---|---|
| 씬 파일, 오브젝트, 씬의 실행 순서와 전환 | [씬](scenes.md) |
| 이미지(스프라이트)와 텍스트 출력, 알파 채널, 좌표계 | [이미지와 텍스트 출력](graphics.md) |
| 컴포넌트 스크립트의 구조, 호출 시점, 오류 처리 | [스크립트](scripts.md) |
| 키보드, 마우스, 터치 입력 | [입력](input.md) |
| 효과음과 배경 음악 | [소리](audio.md) |
| 실행 방식, 핫 리로드, 엔진 탐색 | [게임 실행](running.md) |
| 맵 파일, 타일셋, 레이어, 통행, 맵 오브젝트 | [맵](maps.md) |
| RPG 이벤트와 커맨드 | [RPG 이벤트](rpg-events.md) |
| 노드 그래프로 컴포넌트 정의 | [비주얼 스크립팅](visual-scripting.md) |

## 참고

- [단축키](shortcuts.md)
- [문제 해결](troubleshooting.md)
- [엔진 API 레퍼런스](https://github.com/biud436/Initial2D#lua-대응표): 스크립트에서 호출하는 엔진 함수 목록 (Lua, Ruby)

에디터에서 **도움말 > 사용자 가이드**(F1)를 선택하면 이 문서가 열립니다.
