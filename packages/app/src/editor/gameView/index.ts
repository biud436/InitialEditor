// E4 게임 뷰의 진입점. GameViewStore 를 만들어 editor.gameView 에 붙인다 (실행기보다 먼저: 실행기가 이것을 받는다).
// 게임 탭을 닫으면 에디터 안 실행을 멈춘다. 게임 탭의 그림은 components/documents/GameView.tsx 가 그린다.

import type { Editor } from "../Editor";
import { GameDocument } from "./GameDocument";
import { GameViewStore, type GameViewOptions } from "./GameViewStore";

export { GameDocument, GAME_KIND } from "./GameDocument";
export { GameViewStore } from "./GameViewStore";

export function installGameView(editor: Editor, opts: GameViewOptions = {}): () => void {
  const store = new GameViewStore(editor, opts);
  editor.gameView = store;
  const off = editor.documents.events.on("close", (doc) => {
    if (!(doc instanceof GameDocument)) return;
    store.abort();
    if (editor.runner?.activeMode === "embedded" && editor.runner.isRunning) void editor.runner.stop();
  });
  return () => {
    off();
    store.dispose();
  };
}
