// 게임 탭 (E4). 위에 상태 띠(상태, FPS, 소리 켜기, 실행과 정지와 다시 시작), 아래에 웹 엔진이 그리는 canvas.
// canvas 는 GameViewStore 가 실행마다 새로 만들고 여기서는 붙이기만 한다. 크기는 game.json 의 창 크기에 패널에 맞춘
// 배율(fitScale)을 곱한 CSS 크기다. 탭이 활성이 되거나 게임 탭 제목을 누르거나(DocumentTab) 탭을 다른 그룹으로 옮기면
// canvas 가 키를 받는다.
// 실행 단축키(F5, Shift+F5 등)는 게임(SDL 이 기본 동작을 막는다)보다 먼저 여기서 받아 에디터 커맨드로 돌린다.

import { observer } from "mobx-react-lite";
import { useEffect, useRef, useState } from "react";
import { useEditor } from "../../editor/EditorContext";
import { fitScale } from "../../editor/gameView/canvasTools";
import type { GameDocument } from "../../editor/gameView/GameDocument";
import type { GameViewStore } from "../../editor/gameView/GameViewStore";
import "./GameView.css";

function phaseText(store: GameViewStore): string {
  switch (store.phase) {
    case "staging":
      return store.progress && store.progress.total > 0 ? `파일 복사 중 ${store.progress.done}/${store.progress.total}` : "파일 목록 불러오는 중";
    case "booting":
      return "엔진 시작 중";
    case "running":
      return "실행 중";
    case "ended":
      return store.lastExitCode ? `오류로 종료됨 (종료 코드 ${store.lastExitCode})` : "종료됨";
    case "failed":
      return "실패";
    default:
      return "대기";
  }
}

export const GameView = observer(function GameView({ doc }: { doc: GameDocument }) {
  const editor = useEditor();
  const store = editor.gameView;
  const frameRef = useRef<HTMLDivElement>(null);
  const hostRef = useRef<HTMLDivElement>(null);
  const [avail, setAvail] = useState({ width: 0, height: 0 });

  // canvas 를 담을 자리를 알린다
  useEffect(() => store.attachHost(hostRef.current!), [store]);

  // 패널 크기를 잰다
  useEffect(() => {
    const el = frameRef.current;
    if (!el || typeof ResizeObserver === "undefined") return;
    const ro = new ResizeObserver(() => setAvail({ width: el.clientWidth, height: el.clientHeight }));
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  // 실행 단축키는 게임보다 먼저 (캡처 단계라 canvas 에 닿기 전이다). 모달 대화상자가 떠 있으면 부르지 않는다
  useEffect(() => {
    const host = hostRef.current;
    if (!host) return;
    const onKey = (ev: KeyboardEvent) => {
      if (editor.modals.top) return;
      const id = editor.commands.findByKey(ev);
      if (!id || !id.startsWith("run.")) return;
      ev.preventDefault();
      ev.stopPropagation();
      void editor.commands.execute(id);
    };
    host.addEventListener("keydown", onKey, true);
    return () => host.removeEventListener("keydown", onKey, true);
  }, [editor]);

  const scale = fitScale({ width: avail.width - 16, height: avail.height - 16 }, store.gameSize);
  const width = Math.round(store.gameSize.width * scale);
  const height = Math.round(store.gameSize.height * scale);
  const canvas = store.canvas;

  // CSS 크기. SDL 은 창을 만들 때 CSS 크기가 있으면 그대로 두고 그리기 버퍼만 창 크기로 맞춘다
  useEffect(() => {
    if (!canvas) return;
    canvas.style.width = `${width}px`;
    canvas.style.height = `${height}px`;
    canvas.classList.toggle("is-smooth", !Number.isInteger(scale));
  }, [canvas, width, height, scale]);

  // 탭이 앞으로 오면 키를 게임에. 도킹이 탭 내용을 문서에 다시 붙인 뒤(다음 프레임들)에 초점을 준다
  const active = editor.documents.active === doc;
  const running = store.phase === "running";
  useEffect(() => {
    if (!active || !canvas || !running) return;
    return store.focusCanvas();
  }, [store, active, canvas, running]);

  // 탭을 다른 그룹으로 끌어 옮기면 도킹이 내용 요소를 옮기며 초점이 풀린다. 앞에 있으면 canvas 에 다시 준다
  useEffect(() => {
    let cancel: (() => void) | null = null;
    const off = editor.documentDock.onDocumentMoved((moved) => {
      if (moved !== doc || editor.documents.active !== doc) return;
      cancel?.();
      cancel = store.focusCanvas();
    });
    return () => {
      off();
      cancel?.();
    };
  }, [editor, store, doc]);

  const busy = store.phase === "staging" || store.phase === "booting";
  const endedWithError = store.phase === "ended" && !!store.lastExitCode;
  const run = (id: string) => () => void editor.commands.execute(id);

  return (
    <div className="game-view" data-testid="game-view" data-phase={store.phase} data-scale={scale}>
      <div className="doc-header game-view-header">
        <span className={`game-view-state phase-${store.phase}${endedWithError ? " is-error" : ""}`} data-testid="game-state" data-exit-code={store.lastExitCode ?? undefined}>
          {phaseText(store)}
        </span>
        <span title="game.json 창 크기와 표시 배율">
          {store.gameSize.width} x {store.gameSize.height}, {Math.round(scale * 100)}%
        </span>
        {running && store.fps !== null ? (
          <span className="game-view-fps" data-testid="game-fps" title="초당 프레임입니다 (엔진이 실행한 프레임 수). 엔진 루프는 화면 주사율에 동기화됩니다.">
            {store.fps} FPS
          </span>
        ) : null}
        {running && store.audioSuspended ? (
          <button type="button" className="btn game-view-audio" onClick={() => store.resumeAudio()} title="브라우저 자동 재생 정책에 따라 사용자가 입력하기 전에는 오디오가 일시 중지됩니다. 게임 화면을 클릭해도 재개됩니다." data-testid="game-audio">
            소리 켜기
          </button>
        ) : null}
        <span className="doc-header-spacer" />
        {running || busy ? (
          <>
            <button type="button" className="btn" onClick={run("run.stop")} disabled={!editor.commands.isEnabled("run.stop")} title="정지 (Shift+F5)">
              정지
            </button>
            <button type="button" className="btn" onClick={run("run.restart")} disabled={!running || !editor.commands.isEnabled("run.restart")} title="다시 시작 (파일 다시 복사)">
              다시 시작
            </button>
          </>
        ) : (
          <button type="button" className="btn" onClick={run("run.start")} disabled={!editor.commands.isEnabled("run.start")} title="실행 (F5)">
            실행
          </button>
        )}
      </div>
      <div className="game-view-frame" ref={frameRef}>
        <div className="game-view-host" ref={hostRef} />
        {canvas ? null : (
          <div className="game-view-placeholder" style={{ width, height }} data-testid="game-message">
            {store.message ?? "실행 중인 게임 없음. F5를 누르면 실행됩니다."}
          </div>
        )}
      </div>
    </div>
  );
});
