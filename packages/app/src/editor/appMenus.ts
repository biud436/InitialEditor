// 메뉴 트리. 항목은 커맨드 id 만 가리키고 라벨과 단축키는 커맨드가 준다. 갈래 순서: 파일 10, 편집 20, 씬 30, 실행 40, 도구 50, 창 60, 도움말 70.

import type { MenuItemSpec } from "@initial-editor/core";
import type { Editor } from "./Editor";
import { PANEL_IDS, PANEL_TITLES, PRESET_LABELS, type PresetName } from "./layoutPresets";

export const BRANCH_ORDER: Array<[string, number]> = [
  ["파일", 10],
  ["편집", 20],
  ["씬", 30],
  ["실행", 40],
  ["도구", 50],
  ["창", 60],
  ["도움말", 70],
];

export function appMenuItems(): MenuItemSpec[] {
  const items: MenuItemSpec[] = [
    { path: "파일/새 프로젝트", commandId: "file.newProject", order: 10 },
    { path: "파일/프로젝트 열기", commandId: "file.openProject", order: 20 },
    // 파일/최근 프로젝트/* 는 recentProjects.ts 가 채운다 (order 30 자리)
    { path: "파일/저장", commandId: "file.save", order: 40, separatorBefore: true },
    { path: "파일/모두 저장", commandId: "file.saveAll", order: 50 },
    { path: "파일/프로젝트 닫기", commandId: "file.closeProject", order: 60, separatorBefore: true },

    { path: "편집/되돌리기", commandId: "edit.undo", order: 10 },
    { path: "편집/다시 실행", commandId: "edit.redo", order: 20 },
    { path: "편집/잘라내기", commandId: "edit.cut", order: 30, separatorBefore: true },
    { path: "편집/복사", commandId: "edit.copy", order: 40 },
    { path: "편집/붙여넣기", commandId: "edit.paste", order: 50 },
    { path: "편집/복제", commandId: "edit.duplicate", order: 60 },
    { path: "편집/삭제", commandId: "edit.delete", order: 70 },
    { path: "편집/찾기", commandId: "edit.find", order: 80, separatorBefore: true },

    { path: "씬/새 씬", commandId: "scene.new", order: 10 },
    // 씬/오브젝트 추가/<타입> 은 scene/sceneCommands.ts 가 레지스트리에서 채운다 (order 10 부터). 마지막이 목록 대화상자
    { path: "씬/오브젝트 추가", order: 20 },
    { path: "씬/오브젝트 추가/목록에서 선택", commandId: "scene.addObject", order: 900, separatorBefore: true },
    { path: "씬/시작 씬으로 지정", commandId: "scene.setStart", order: 30, separatorBefore: true },
    { path: "씬/격자 표시", commandId: "scene.toggleGrid", order: 40, separatorBefore: true },
    { path: "씬/스냅", commandId: "scene.toggleSnap", order: 50 },

    { path: "실행/실행", commandId: "run.start", order: 10 },
    { path: "실행/정지", commandId: "run.stop", order: 20 },
    { path: "실행/다시 시작", commandId: "run.restart", order: 25 },
    { path: "실행/현재 씬부터 실행", commandId: "run.fromScene", order: 30 },
    { path: "실행/리로드", commandId: "run.reload", order: 40, separatorBefore: true },
    { path: "실행/언어/Lua", commandId: "run.language.lua", order: 10 },
    { path: "실행/언어/Ruby (mruby)", commandId: "run.language.mruby", order: 20 },
    { path: "실행/엔진 경로", commandId: "run.enginePath", order: 60 },

    { path: "도구/설정", commandId: "tools.settings", order: 10 },

    { path: "도움말/엔진 API 대응표", commandId: "help.api", order: 10 },
    { path: "도움말/계획 문서", commandId: "help.plans", order: 20 },
    { path: "도움말/InitialEditor 정보", commandId: "help.about", order: 30, separatorBefore: true },
  ];
  PANEL_IDS.forEach((id, i) => items.push({ path: `창/${PANEL_TITLES[id]}`, commandId: `window.panel.${id}`, order: 10 + i }));
  (Object.keys(PRESET_LABELS) as PresetName[]).forEach((preset, i) =>
    items.push({ path: `창/레이아웃/${PRESET_LABELS[preset]}`, commandId: `window.layout.${preset}`, order: 10 + i }),
  );
  items.push({ path: "창/레이아웃 초기화", commandId: "window.layout.reset", order: 90 });
  // 하위 갈래 자체의 순서와 구분선 (항목은 각각 다른 곳에서 등록한다)
  items.push({ path: "파일/최근 프로젝트", order: 30 });
  items.push({ path: "실행/언어", order: 50, separatorBefore: true });
  items.push({ path: "창/레이아웃", order: 50, separatorBefore: true });
  return items;
}

export function registerAppMenus(editor: Editor): void {
  for (const [label, order] of BRANCH_ORDER) editor.menus.setBranchOrder(label, order);
  for (const item of appMenuItems()) editor.menus.register(item);
}
