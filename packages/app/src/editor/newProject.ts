// 새 프로젝트 (Tauri 모드). 폴더를 고르고 game.json, scripts/lua/main.lua, resources/ 를 만든다.
// 브라우저 모드는 폴더 선택이 없어 비활성이다 (툴팁에 이유).

import { DEFAULT_GAME_JSON, GAME_JSON, serializeGameJson } from "@initial-editor/core";
import type { Editor } from "./Editor";

export const RESOURCE_DIRS = ["resources/images", "resources/audio", "resources/fonts", "resources/scenes", "resources/maps"];
export const MAIN_LUA = "scripts/lua/main.lua";

/** 씬 계약 네 함수가 든 최소 템플릿 (docs/plans/03-project-and-runtime.md 5절) */
export function mainLuaTemplate(name: string): string {
  return `-- ${name}: Initial2D 진입점. 씬 계약 네 함수 (init, update, render, destroy).
-- 엔진은 있는 것만 부른다. update 의 elapsed 는 밀리초다.
-- 씬 로더(scripts/lua/scene_loader)가 오면 init 에서 game.json 의 startScene 을 연다.

function init()
end

function update(elapsed)
  if Input.trigger("escape") then
    System.exit()
  end
end

function render()
  Graphics.drawText(24, 24, "${name}")
end

function destroy()
end
`;
}

export async function createNewProject(editor: Editor): Promise<boolean> {
  const { backend, modals, toasts, log } = editor;
  if (!backend.capabilities.pickFolder) {
    toasts.warn("이 모드에서는 새 프로젝트를 만들 수 없다");
    return false;
  }
  if (!(await editor.closeProject())) return false;
  const folder = await backend.pickFolder();
  if (!folder) return false;

  const info = await backend.open(folder);
  try {
    const entries = await backend.list("");
    if (entries.length > 0) {
      const ok = await modals.confirm({
        title: "새 프로젝트",
        message: `폴더가 비어 있지 않다 (${entries.length}개 항목). 그래도 여기에 프로젝트를 만들까? 있는 파일은 그대로 두고 없는 것만 만든다.`,
        okLabel: "만들기",
      });
      if (!ok) return false;
    }
    if (!(await backend.exists(GAME_JSON))) {
      await backend.writeText(GAME_JSON, serializeGameJson({ ...DEFAULT_GAME_JSON, name: info.name, startScene: "main", extra: {} }));
    }
    if (!(await backend.exists(MAIN_LUA))) await backend.writeText(MAIN_LUA, mainLuaTemplate(info.name));
    for (const dir of RESOURCE_DIRS) await backend.mkdir(dir);
    log.info("editor", `새 프로젝트를 만들었다: ${info.root}`);
  } catch (e) {
    log.error("editor", `새 프로젝트를 만들지 못했다: ${(e as Error).message}`);
    toasts.error(`새 프로젝트를 만들지 못했다: ${(e as Error).message}`);
    return false;
  } finally {
    await backend.close().catch(() => {});
  }
  const opened = await editor.openProject(folder);
  if (opened) toasts.success(`새 프로젝트: ${info.name}`);
  return opened;
}
