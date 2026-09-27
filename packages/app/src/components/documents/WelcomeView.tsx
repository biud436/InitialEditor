// 시작 탭. 모드 설명, 프로젝트 열기, 최근 프로젝트, 계획 요약.
// 브라우저 폴더 모드(웹판)는 폴더 열기, 최근 폴더 다시 열기, 샘플로 해 보기 (BrowserFoldersSection).

import { observer } from "mobx-react-lite";
import { isFolderFallback, MODE_LABELS, SAMPLE_ROOT, type BackendMode } from "../../editor/backends";
import { browserFolders } from "../../editor/browserFolders";
import { useEditor } from "../../editor/EditorContext";
import type { Editor } from "../../editor/Editor";
import { PLANS_INDEX } from "../../editor/appCommands";
import "./WelcomeView.css";

const MODE_DESCRIPTION: Record<BackendMode, string> = {
  memory: "브라우저 메모리의 샘플 프로젝트다. 서버가 필요 없고, 새로 고치면 처음으로 돌아간다.",
  bridge: "브라우저 모드다. 엔진 저장소의 브리지 서버(node tools/bridge/server.js --project <폴더>)로 프로젝트 폴더를 읽고 쓴다. 엔진 실행은 데스크톱 앱에서만 된다.",
  tauri: "데스크톱 앱이다. 폴더를 직접 열고 파일을 감시하며 엔진을 띄운다.",
  browser: "웹판이다. 내 컴퓨터의 프로젝트 폴더를 브라우저에서 바로 열어 읽고 쓴다. 게임은 게임 뷰에서 엔진(WASM)으로 돈다. 밖에서 바꾼 파일은 1.5초 안에 보인다.",
};

const FALLBACK_NOTICE = "이 브라우저에는 폴더 열기가 없어 샘플 프로젝트로 시작했다. 내 폴더를 열려면 크롬이나 엣지에서 이 페이지를 연다.";
const NO_PICKER = "이 브라우저에는 폴더 열기가 없다 (크롬, 엣지에서 된다)";

const BrowserFoldersSection = observer(function BrowserFoldersSection({ editor }: { editor: Editor }) {
  const folders = browserFolders(editor);
  return (
    <>
      <div className="welcome-actions">
        <button
          type="button"
          className="btn btn-primary"
          disabled={!folders.supported}
          title={folders.supported ? "프로젝트 폴더(game.json 이 있는 폴더)를 고른다" : NO_PICKER}
          onClick={() => void folders.openNew()}
        >
          폴더 열기
        </button>
        <button type="button" className="btn" onClick={() => void folders.openSample()}>
          샘플로 해 보기
        </button>
      </div>
      {!folders.supported && <p className="welcome-notice">{NO_PICKER}</p>}
      <section className="welcome-section">
        <h2>최근 폴더</h2>
        {folders.records.length === 0 ? (
          <p className="muted">{folders.loaded ? "아직 없다" : "읽는 중"}</p>
        ) : (
          <ul className="welcome-recent" data-testid="welcome-recent-folders">
            {folders.records.map((record) => (
              <li key={record.key}>
                <span className="welcome-recent-name" title={record.name}>
                  {record.name}
                </span>
                <button type="button" className="btn" onClick={() => void folders.reopen(record)}>
                  다시 열기
                </button>
                <button type="button" className="btn btn-ghost" aria-label={`${record.name} 을(를) 목록에서 지우기`} onClick={() => void folders.forget(record.key)}>
                  ×
                </button>
              </li>
            ))}
          </ul>
        )}
        {folders.records.length > 0 && folders.restoreNotice && (
          <p className="welcome-notice" data-testid="welcome-restore-notice">
            {folders.restoreNotice}
          </p>
        )}
        <p className="muted welcome-hint">브라우저가 폴더 권한을 기억하지 않았으면 다시 열 때 한 번 더 묻는다.</p>
      </section>
    </>
  );
});

export const WelcomeView = observer(function WelcomeView() {
  const editor = useEditor();
  const recent = editor.settings.settings.recentProjects;
  const run = (id: string) => void editor.commands.execute(id);
  return (
    <div className="welcome" data-testid="welcome">
      <h1 className="welcome-title">InitialEditor</h1>
      <p className="welcome-mode">
        <strong>{MODE_LABELS[editor.mode]} 모드.</strong> {MODE_DESCRIPTION[editor.mode]}
      </p>
      {isFolderFallback(editor.mode) && <p className="welcome-notice">{FALLBACK_NOTICE}</p>}
      {editor.mode === "browser" ? (
        <BrowserFoldersSection editor={editor} />
      ) : (
        <div className="welcome-actions">
          {editor.mode === "memory" ? (
            <button type="button" className="btn btn-primary" onClick={() => void editor.openProject(SAMPLE_ROOT)}>
              샘플 프로젝트 열기
            </button>
          ) : (
            <>
              <button type="button" className="btn btn-primary" onClick={() => run("file.openProject")}>
                프로젝트 열기
              </button>
              {editor.mode === "tauri" && (
                <button type="button" className="btn" onClick={() => run("file.newProject")}>
                  새 프로젝트
                </button>
              )}
            </>
          )}
        </div>
      )}
      {(editor.mode === "bridge" || editor.mode === "tauri") && (
        <section className="welcome-section">
          <h2>최근 프로젝트</h2>
          {recent.length === 0 ? (
            <p className="muted">아직 없다</p>
          ) : (
            <ul className="welcome-recent">
              {recent.map((root) => (
                <li key={root}>
                  <button type="button" className="btn btn-ghost welcome-recent-open" title={root} onClick={() => void editor.openProject(root)}>
                    {root}
                  </button>
                  <button type="button" className="btn btn-ghost" aria-label={`${root} 을(를) 목록에서 지우기`} onClick={() => editor.settings.removeRecentProject(root)}>
                    ×
                  </button>
                </li>
              ))}
            </ul>
          )}
        </section>
      )}
      <section className="welcome-section">
        <h2>계획</h2>
        <p>
          E0(지금)은 토대다: 프로젝트 폴더를 열어 파일 트리와 콘솔을 보이고, 테마와 도킹 레이아웃이 저장된다. E1 에서 스크립트 편집과 핫 리로드와 실행 버튼이, E2 에서 씬과
          오브젝트가, E3 에서 타일맵 확장이 붙는다.{" "}
          <a href={PLANS_INDEX} target="_blank" rel="noreferrer">
            계획 문서
          </a>
        </p>
      </section>
    </div>
  );
});
