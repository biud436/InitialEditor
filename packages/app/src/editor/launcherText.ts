// 시작 창과 새 게임 대화상자의 문구 (docs/plans/quality.md Q1, 7절).
// 용어 개정(7.3절, "게임"과 "프로젝트")은 저자 결정을 기다리므로 여기 한 곳에 모아 둔다.

import type { ProjectTemplateId } from "./scene/templateManifest";

export const LAUNCHER = {
  tagline: "Initial2D 게임 에디터",
  newGame: "새 게임",
  openGame: "게임 열기",
  openFolder: "폴더 열기",
  openSample: "샘플 게임 열기",
  recent: "최근 게임",
  recentFolders: "최근 폴더",
  recentEmpty: "최근에 연 게임이 없습니다",
  recentEmptyHint: "새 게임을 만들거나, 게임 폴더를 엽니다.",
  removeRecent: "목록에서 지우기",
  reopen: "다시 열기",
  sampleTitle: "떠나기 전에",
  sampleDescription: "항구 마을의 반나절을 그린 작은 RPG입니다. 맵, 이벤트, 대화가 들어 있습니다.",
  sampleMemoryNote: "샘플은 이 브라우저 탭에서만 바뀝니다. 페이지를 닫으면 처음 상태로 돌아갑니다.",
  guide: "사용자 가이드",
  shortcuts: "단축키",
  settings: "환경 설정",
  desktopApp: "데스크톱 앱 받기",
  noFolderAccess: "이 브라우저는 폴더를 열 수 없습니다. 크롬이나 엣지에서 엽니다.",
  fallbackNote: "이 브라우저는 폴더를 열 수 없어 샘플 게임으로 시작했습니다. 크롬이나 엣지에서는 내 컴퓨터의 게임 폴더를 열 수 있습니다.",
} as const;

export interface TemplateCopy {
  title: string;
  description: string;
}

export const TEMPLATE_COPY: Record<ProjectTemplateId, TemplateCopy> = {
  empty: { title: "빈 게임", description: "빈 씬에서 시작합니다." },
  flappy: { title: "플래피버드", description: "새를 날려 파이프 사이를 지나는 게임입니다." },
  tilemap: { title: "타일맵", description: "타일셋과 빈 맵에서 시작합니다." },
  rpg: { title: "RPG", description: "항구 마을과 여관, 대화와 이벤트가 들어 있습니다." },
};

export const NEW_GAME = {
  title: "새 게임",
  template: "템플릿",
  name: "게임 이름",
  namePlaceholder: "내 게임",
  nameRequired: "게임 이름을 입력하십시오.",
  location: "저장할 곳",
  chooseFolder: "폴더 선택",
  folderNone: "선택한 폴더 없음",
  changeFolder: "바꾸기",
  folderRequired: "게임을 저장할 폴더를 선택하십시오.",
  screen: "화면 크기",
  screenFixed: (w: number, h: number) => `${w} x ${h} (이 템플릿에 맞춘 크기)`,
  custom: "직접 입력",
  pixelHint: "320 x 180으로 그리고 3배로 키워 960 x 540 창에 띄웁니다.",
  width: "너비",
  height: "높이",
  language: "스크립트 언어",
  luaOnly: "이 템플릿은 Lua로만 만듭니다.",
  cancel: "취소",
  create: "만들기",
} as const;
