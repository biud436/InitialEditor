// RPG 확장 (docs/plans/e5-rpg.md). 모델(DOM 없음)과 확장 등록(rpgExtension: 이벤트 레이어, 목록 패널, 실행 제공자와 이벤트 실행 명령).
// 커맨드 목록 편집기와 인자 위젯 같은 React 부품은 "@initial-editor/ext-rpg/ui" 로 받는다.
export * from "./model";
export { EVENT_PLAY_COMMAND_IDS, EVENTS_PANEL_ID, RPG_EXTENSION_ID, rpgExtension, type RpgExports } from "./extension";
export { RpgProjectStore, type RpgProjectStoreDeps } from "./projectStore";
