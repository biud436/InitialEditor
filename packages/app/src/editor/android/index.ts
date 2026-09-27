// 안드로이드로 스테이징 (docs/plans/e6-packaging.md 6.3). 명령 android.stage 를 실행 메뉴의 구분선 아래에 두고, 누르면
// 저장 안 된 문서를 묻고, 엔진 저장소를 찾고(못 찾으면 이유와 설정 열기), 확인 대화상자(미리 세기, RTP 체크) 뒤에
// AndroidStageStore 로 스테이징한다. Tauri 앱에서만 켜지고 다른 백엔드는 이유를 툴팁에 보인다.

import { androidRepoProbe, androidStage } from "@initial-editor/backend-tauri";
import { openSettingsDialog } from "../../components/SettingsDialog";
import type { Editor } from "../Editor";
import { saveAllDocuments } from "../saveCommands";
import { askDirtyBeforeStage, askMissingRepo, askStageConfirm } from "./AndroidStageDialog";
import { AndroidStageStore, type AndroidHost, type AndroidStageDeps } from "./AndroidStageStore";

export { AndroidStageStore } from "./AndroidStageStore";

export const ANDROID_STAGE_COMMAND = "android.stage";
export const ANDROID_STAGE_LABEL = "안드로이드로 스테이징";

/** 에디터에서 스토어의 host 를 만든다 (프로젝트는 백엔드를 바꾸면 새것이라 늘 에디터에서 읽는다) */
export function androidHost(editor: Editor): AndroidHost {
  return {
    get project() {
      return editor.project;
    },
    settings: editor.settings,
    log: editor.log,
    toasts: editor.toasts,
    get platform() {
      return editor.platform;
    },
    engine: () => ({ path: editor.runner?.enginePath ?? null, source: editor.runner?.engineSource ?? "none" }),
  };
}

/** 명령의 흐름. 도중에 취소하면 아무것도 돌리지 않는다 */
export async function runAndroidStage(editor: Editor, store: AndroidStageStore): Promise<void> {
  if (!store.enabled) return;
  const dirty = editor.documents.dirtyDocuments.length;
  if (dirty > 0) {
    const choice = await askDirtyBeforeStage(editor.modals, dirty);
    if (choice === "cancel") return;
    if (choice === "save") {
      const result = await saveAllDocuments(editor);
      if (result.cancelled.length || result.failed.length || result.reloadFailed.length) return;
    }
  }
  const { found, searched } = await store.discover();
  if (!found) {
    if (await askMissingRepo(editor.modals, searched)) await openSettingsDialog(editor);
    return;
  }
  const choice = await askStageConfirm(editor.modals, store, found, editor.project.root);
  if (!choice) return;
  await store.stage(found, choice.withRtp);
}

export function installAndroidStage(editor: Editor, deps?: AndroidStageDeps | null): AndroidStageStore {
  const shell: AndroidStageDeps | null = deps !== undefined ? deps : editor.mode === "tauri" ? { probe: androidRepoProbe, run: androidStage } : null;
  const store = new AndroidStageStore(androidHost(editor), shell);
  editor.commands.register({
    id: ANDROID_STAGE_COMMAND,
    label: ANDROID_STAGE_LABEL,
    category: "run",
    enabled: () => store.enabled,
    run: () => runAndroidStage(editor, store),
  });
  editor.setHint(ANDROID_STAGE_COMMAND, () => store.disabledReason);
  editor.menus.register({ path: `실행/${ANDROID_STAGE_LABEL}`, commandId: ANDROID_STAGE_COMMAND, order: 70, separatorBefore: true });
  return store;
}
