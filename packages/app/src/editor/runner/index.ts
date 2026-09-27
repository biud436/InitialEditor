// E1 실행기의 진입점. RunnerStore 를 만들어 에디터에 붙이고, 실행 커맨드를 등록하고, 이벤트를 잇는다:
//   projectOpened  → 엔진 탐색 (결과를 콘솔에). 프로젝트가 가리키는 엔진은 신뢰 확인 뒤에만 (EngineTrustDialog.tsx).
//                    에디터 안 실행이면 웹 엔진의 MANIFEST 를 미리 읽는다
//   projectClosed  → 실행 중이면 정지
//   documentSaved  → 저장 시 핫 리로드 (reloadOnSave.ts 의 규칙, 300ms 디바운스, 에디터 안 엔진은 저장한 파일만,
//                    뜨는 중이면 첫 프레임 뒤에. 밖의 엔진으로 보낼지는 백엔드의 capabilities.hmr이 정한다)
//   설정의 엔진 경로가 바뀌면 다시 탐색
// 에디터 안 실행(E4)은 editor.gameView 가 맡는다 (installGameView 가 먼저 붙인다).
// 콘솔의 오류 링크(openErrorLink.ts)와 툴바와 상태 바는 editor.runner 를 본다.

import { engineBundled, engineExists, engineFeatures } from "@initial-editor/backend-tauri";
import { reaction } from "mobx";
import { BROWSER_NO_RUN } from "../appCommands";
import type { Editor } from "../Editor";
import { askEngineTrust } from "./EngineTrustDialog";
import { SaveReloader, shouldReloadOnSave } from "./reloadOnSave";
import { registerRunCommands } from "./runCommands";
import { browserRunNotice, RunnerStore } from "./RunnerStore";

export { RunnerStore } from "./RunnerStore";
export { openErrorLink } from "./openErrorLink";

export function installRunner(editor: Editor): () => void {
  const tauri = editor.mode === "tauri";
  const runner = new RunnerStore(editor, {
    probe: tauri ? (exe, opts) => engineFeatures(exe, opts) : undefined,
    exists: tauri ? engineExists : undefined,
    bundled: tauri ? engineBundled : undefined,
    askTrust: (q) => askEngineTrust(editor.modals, q),
    unavailableReason: BROWSER_NO_RUN,
    embedded: editor.gameView,
  });
  editor.runner = runner;
  registerRunCommands(editor, runner);

  const saves = new SaveReloader({
    accepts: (path) =>
      shouldReloadOnSave({
        path,
        reloadOnSave: editor.settings.settings.reloadOnSave,
        canSpawn: editor.backend.capabilities.run,
        running: runner.state === "running",
        embeddedActive: runner.embeddedActive,
        canPush: runner.canPush,
      }),
    reload: (paths) => void runner.reload(paths, { fromSave: true }),
  });
  const disposers = [
    editor.events.on("projectOpened", () => {
      if (editor.backend.capabilities.run) void runner.resolveEngine();
      else editor.log.info("runner", browserRunNotice(runner.canPush));
      if (runner.mode === "embedded") void editor.gameView.loadFeatures().catch(() => {});
    }),
    editor.events.on("projectClosed", () => {
      saves.cancel();
      void runner.onProjectClosed();
    }),
    editor.events.on("documentSaved", (doc) => saves.onSaved(doc.path)),
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
    saves.cancel();
    for (const d of disposers) d();
    runner.dispose();
  };
}
