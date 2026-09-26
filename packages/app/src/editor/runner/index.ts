// E1 실행기의 진입점. RunnerStore 를 만들어 에디터에 붙이고, 실행 커맨드를 등록하고, 이벤트를 잇는다:
//   projectOpened  → 엔진 탐색 (결과를 콘솔에)
//   projectClosed  → 실행 중이면 정지
//   documentSaved  → 저장 시 핫 리로드 (reloadOnSave.ts 의 규칙, 300ms 디바운스)
//   설정의 엔진 경로가 바뀌면 다시 탐색
// 콘솔의 오류 링크(openErrorLink.ts)와 툴바와 상태 바는 editor.runner 를 본다.

import { engineFeatures } from "@initial-editor/backend-tauri";
import { reaction } from "mobx";
import { BROWSER_NO_RUN } from "../appCommands";
import type { Editor } from "../Editor";
import { Debouncer, RELOAD_DEBOUNCE_MS, shouldReloadOnSave } from "./reloadOnSave";
import { registerRunCommands } from "./runCommands";
import { RunnerStore } from "./RunnerStore";

export { RunnerStore } from "./RunnerStore";
export { openErrorLink } from "./openErrorLink";

export function installRunner(editor: Editor): () => void {
  const runner = new RunnerStore(editor, {
    probe: editor.mode === "tauri" ? engineFeatures : undefined,
    unavailableReason: BROWSER_NO_RUN,
  });
  editor.runner = runner;
  registerRunCommands(editor, runner);

  const debounce = new Debouncer(RELOAD_DEBOUNCE_MS);
  const disposers = [
    editor.events.on("projectOpened", () => {
      if (editor.backend.capabilities.run) void runner.resolveEngine();
      else editor.log.info("runner", `${BROWSER_NO_RUN}. 터미널에서 INITIAL2D_HMR=1 로 띄워 두면 저장 시 리로드와 수동 리로드는 된다`);
    }),
    editor.events.on("projectClosed", () => {
      debounce.cancel();
      void runner.onProjectClosed();
    }),
    editor.events.on("documentSaved", (doc) => {
      const ok = shouldReloadOnSave({
        path: doc.path,
        reloadOnSave: editor.settings.settings.reloadOnSave,
        canSpawn: editor.backend.capabilities.run,
        running: runner.state === "running",
      });
      if (ok) debounce.schedule(() => void runner.reload());
    }),
    // 설정 대화상자에서 글자마다 --features 를 띄우지 않게 잠시 기다린다
    reaction(
      () => editor.settings.settings.enginePath,
      () => {
        if (editor.project.isOpen && editor.backend.capabilities.run) void runner.resolveEngine();
      },
      { delay: 500 },
    ),
  ];
  return () => {
    debounce.cancel();
    for (const d of disposers) d();
    runner.dispose();
  };
}
