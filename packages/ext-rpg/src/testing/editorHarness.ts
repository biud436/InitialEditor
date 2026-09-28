// 부품 테스트의 틀: 픽스처 스키마로 이벤트 섹션, 편집기, 되돌리기 스택을 만든다 (맵 문서의 doc.apply 자리)
import { UndoStack, type Command } from "@initial-editor/core";
import { EventEditor, type EditContext } from "../model/commands";
import { EventsSection } from "../model/events";
import { cloneJson } from "../model/json";
import type { RefSources } from "../model/refs";
import { fixtureGame, fixtureItems, fixtureSchema } from "./fixtures";

/** 테스트가 쓰는 프로젝트 파일 목록 (프로젝트 기준, ./ 없이) */
export const TEST_FILES: readonly string[] = [
  "resources/audio/door.wav",
  "resources/audio/bell.ogg",
  "resources/bgm/harbor.ogg",
  "resources/charsets/placeholder.png",
  "resources/faces/placeholder.png",
  "resources/images/port16.png",
  "resources/maps/port_town.json",
];

export function editorHarness(events: unknown[], extra: Partial<EditContext> = {}) {
  const schema = fixtureSchema();
  const section = new EventsSection(cloneJson(events), schema);
  const ctx: EditContext = { schema, map: { width: 30, height: 30, collision: null }, locked: null, ...extra };
  const editor = new EventEditor(section, () => ctx);
  const stack = new UndoStack();
  const apply = (cmd: Command) => stack.push(cmd);
  const refs: RefSources = { schema, game: fixtureGame(), items: fixtureItems(), events: section.list };
  return { schema, section, ctx, editor, stack, apply, refs };
}
