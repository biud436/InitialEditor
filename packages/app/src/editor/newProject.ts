// 새 프로젝트 (Tauri 모드). 폴더를 고르고, 템플릿(빈 프로젝트, 플래피버드)과 언어(Lua, Ruby)를 물은 뒤 엔진에서
// 복사한 템플릿(packages/app/templates, scene/projectTemplates.ts)으로 game.json, 진입점, 씬 로더, 씬, 자산을 만든다.
// 브라우저 모드는 폴더 선택이 없어 비활성이다 (툴팁에 이유).

import type { Editor } from "./Editor";
import { openNewProjectDialog } from "./scene/NewProjectDialog";
import { writeProjectTemplate } from "./scene/projectTemplates";
import { TEMPLATE_LABELS } from "./scene/templateManifest";

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
    const options = await openNewProjectDialog(editor, { name: info.name, folder: info.root });
    if (!options) return false;
    const written = await writeProjectTemplate(backend, options);
    log.info("editor", `새 프로젝트를 만들었다: ${info.root} (${TEMPLATE_LABELS[options.template]}, ${options.language}, 파일 ${written.length}개)`);
    for (const p of written) log.append("debug", "editor", `  만듦: ${p}`);
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
