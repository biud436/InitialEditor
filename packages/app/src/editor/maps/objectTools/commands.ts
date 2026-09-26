// 맵 오브젝트 커맨드: map.playHere (여기서 실행). Ctrl+F5는 run.fromScene이 들고 있고, 활성 문서가 맵이면
// 이 커맨드로 넘긴다 (runner/runCommands.ts). 메뉴 자리는 "맵" 갈래가 있으면 맵/여기서 실행, 없으면 실행/여기서 실행이다.
// 갈래는 다른 모듈이 나중에 등록할 수 있으므로 메뉴가 바뀔 때마다 자리를 다시 본다.
// 안내(힌트)는 꺼진 이유, 켜져 있으면 위치 규칙이다. 스키마의 play.maps가 받지 않는 맵에서는 켜 두고, 그 이유를
// 메뉴 툴팁(setNote)과 누를 때의 토스트와 콘솔로 알린다.

import type { MenuItemSpec } from "@initial-editor/core";
import type { Editor } from "../../Editor";
import { playHere, playHereDisabledReason, playHereHint, playHereRefusal } from "./playHere";
import { PLAY_POSITION_RULE } from "./rules";

export const PLAY_HERE_ID = "map.playHere";
export const PLAY_HERE_LABEL = "여기서 실행";
const MAP_BRANCH = "맵";

/** 메뉴 항목 자리: 맵 갈래가 있으면 그 아래, 없으면 실행 갈래 */
export function playHereMenuSpec(items: readonly MenuItemSpec[]): MenuItemSpec {
  const hasMapBranch = items.some((i) => i.commandId !== PLAY_HERE_ID && i.path.split("/")[0]?.trim() === MAP_BRANCH);
  return hasMapBranch
    ? { path: `${MAP_BRANCH}/${PLAY_HERE_LABEL}`, commandId: PLAY_HERE_ID, order: 900, separatorBefore: true }
    : { path: `실행/${PLAY_HERE_LABEL}`, commandId: PLAY_HERE_ID, order: 35 };
}

export function registerMapObjectCommands(editor: Editor): () => void {
  const offCommand = editor.commands.register({
    id: PLAY_HERE_ID,
    label: PLAY_HERE_LABEL,
    category: "map",
    enabled: () => playHereDisabledReason(editor) === undefined,
    run: async () => {
      await playHere(editor);
    },
  });
  editor.setHint(PLAY_HERE_ID, () => playHereHint(editor) ?? PLAY_POSITION_RULE);
  editor.setNote(PLAY_HERE_ID, () => playHereRefusal(editor) ?? undefined);

  let placed: { path: string; off: () => void } | null = null;
  const place = () => {
    const spec = playHereMenuSpec(editor.menus.items);
    if (placed?.path === spec.path) return;
    const previous = placed;
    placed = { path: spec.path, off: () => {} };
    previous?.off();
    placed.off = editor.menus.register(spec);
  };
  place();
  const offMenus = editor.menus.events.on("change", place);
  return () => {
    offMenus();
    placed?.off();
    offCommand();
  };
}
