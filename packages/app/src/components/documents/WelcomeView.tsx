// 시작 탭. 모드 설명, 프로젝트 열기, 최근 프로젝트, 계획 요약.
// 브라우저 폴더 모드(웹판)는 폴더 열기, 새 프로젝트, 최근 폴더 다시 열기, 샘플로 해 보기 (BrowserFoldersSection).
// 웹판(브라우저 폴더, 메모리)은 아래에 데스크톱 앱 받기와 웹판에서 안 되는 것 한 줄 (e6-packaging.md 7.4).
// 바깥 링크는 openExternal 을 거친다 (ExternalLink).

import { observer } from "mobx-react-lite";
import { useEffect, useState } from "react";
import { editionLink, PLANS_INDEX, webLimits } from "../../editor/about";
import { isFolderFallback, MODE_LABELS, SAMPLE_ROOT, type BackendMode } from "../../editor/backends";
import { browserFolders, openSampleMap } from "../../editor/browserFolders";
import { useEditor } from "../../editor/EditorContext";
import type { Editor } from "../../editor/Editor";
import { ExternalLink } from "../ExternalLink";
import "./WelcomeView.css";

const MODE_DESCRIPTION: Record<BackendMode, string> = {
  memory: "브라우저 메모리의 샘플 프로젝트입니다. 서버가 필요 없으며, 페이지를 다시 열면 초기 상태로 복원됩니다.",
  bridge: "엔진 저장소의 브리지 서버(node tools/bridge/server.js --project <폴더>)를 통해 프로젝트 폴더를 읽고 씁니다. 게임은 게임 탭의 웹 엔진으로 실행하며, 엔진 프로세스 실행은 데스크톱 앱에서만 지원합니다.",
  tauri: "폴더 직접 열기, 파일 변경 감시, 엔진 프로세스 실행",
  browser: "로컬 프로젝트 폴더를 브라우저에서 직접 열어 읽고 씁니다. 게임은 게임 탭의 웹 엔진(WASM)으로 실행합니다. 외부에서 변경한 파일은 1.5초 안에 반영됩니다.",
};

const FALLBACK_NOTICE = "이 브라우저는 폴더 열기를 지원하지 않아 샘플 프로젝트로 시작했습니다. 로컬 폴더는 크롬이나 엣지에서 열 수 있습니다.";
const NO_PICKER = "이 브라우저는 폴더 열기를 지원하지 않습니다 (크롬과 엣지에서 지원합니다)";

const BrowserFoldersSection = observer(function BrowserFoldersSection({ editor }: { editor: Editor }) {
  const folders = browserFolders(editor);
  return (
    <>
      <div className="welcome-actions">
        <button
          type="button"
          className="btn btn-primary"
          disabled={!folders.supported}
          title={folders.supported ? "프로젝트 폴더(game.json이 있는 폴더) 선택" : NO_PICKER}
          onClick={() => void folders.openNew()}
        >
          폴더 열기
        </button>
        <button
          type="button"
          className="btn"
          disabled={!folders.supported}
          title={folders.supported ? "폴더 선택 후 템플릿으로 새 프로젝트 생성" : NO_PICKER}
          onClick={() => void editor.commands.execute("file.newProject")}
        >
          새 프로젝트
        </button>
        <button type="button" className="btn" onClick={() => void folders.openSample()} disabled={folders.openingSample}>
          샘플 프로젝트 열기
        </button>
      </div>
      {!folders.supported && <p className="welcome-notice">{NO_PICKER}</p>}
      <section className="welcome-section">
        <h2>최근 폴더</h2>
        {folders.records.length === 0 ? (
          <p className="muted">{folders.loaded ? "최근 폴더 없음" : "불러오는 중"}</p>
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
                <button type="button" className="btn btn-ghost" aria-label={`최근 폴더 목록에서 제거: ${record.name}`} onClick={() => void folders.forget(record.key)}>
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
        <p className="muted welcome-hint">브라우저에 폴더 권한이 저장되지 않은 경우 다시 열 때 권한 요청</p>
      </section>
    </>
  );
});

/** 웹판의 아래 줄: 데스크톱 앱 받기와 웹판에서 안 되는 것 (웹 엔진에 mruby 가 없으면 Ruby 실행도) */
const WebEditionFooter = observer(function WebEditionFooter({ editor }: { editor: Editor }) {
  const view = editor.gameView;
  useEffect(() => {
    void view?.loadFeatures().catch(() => {});
  }, [view]);
  const link = editionLink(editor.mode);
  const features = view?.manifest?.features ?? null;
  return (
    <section className="welcome-section welcome-web" data-testid="welcome-web">
      <p>
        <ExternalLink host={editor} href={link.url} testId="welcome-edition">
          {link.label}
        </ExternalLink>
      </p>
      <p className="muted" data-testid="welcome-web-limits">
        브라우저 모드 미지원: {webLimits(features).join(", ")} (데스크톱 앱에서 지원)
      </p>
    </section>
  );
});

export const WelcomeView = observer(function WelcomeView() {
  const editor = useEditor();
  const recent = editor.settings.settings.recentProjects;
  const run = (id: string) => void editor.commands.execute(id);
  const fallback = isFolderFallback(editor.mode);
  const [openingSample, setOpeningSample] = useState(false);
  const openMemorySample = async () => {
    // RPG 데모는 그림을 받아 푸는 데 1초쯤 걸린다. 그동안 누른 클릭은 무시한다
    if (openingSample) return;
    setOpeningSample(true);
    try {
      // 배포된 웹판이 폴더 열기가 없어 메모리로 시작했으면 "샘플로 해 보기" 처럼 샘플 맵을 연다
      if ((await editor.openProject(SAMPLE_ROOT)) && fallback) await openSampleMap(editor);
    } finally {
      setOpeningSample(false);
    }
  };
  return (
    <div className="welcome" data-testid="welcome">
      <h1 className="welcome-title">InitialEditor</h1>
      <p className="welcome-mode">
        <strong>{MODE_LABELS[editor.mode]} 모드.</strong> {MODE_DESCRIPTION[editor.mode]}
      </p>
      {fallback && <p className="welcome-notice">{FALLBACK_NOTICE}</p>}
      {editor.mode === "browser" ? (
        <BrowserFoldersSection editor={editor} />
      ) : (
        <div className="welcome-actions">
          {editor.mode === "memory" ? (
            <button type="button" className="btn btn-primary" onClick={() => void openMemorySample()} disabled={openingSample}>
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
            <p className="muted">최근 프로젝트 없음</p>
          ) : (
            <ul className="welcome-recent">
              {recent.map((root) => (
                <li key={root}>
                  <button type="button" className="btn btn-ghost welcome-recent-open" title={root} onClick={() => void editor.openProject(root)}>
                    {root}
                  </button>
                  <button type="button" className="btn btn-ghost" aria-label={`최근 프로젝트 목록에서 제거: ${root}`} onClick={() => editor.settings.removeRecentProject(root)}>
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
          E0부터 E6까지 마쳤습니다: 프로젝트와 도킹 레이아웃, 스크립트 편집과 핫 리로드, 씬과 컴포넌트, 타일맵, 게임 탭, RPG 이벤트, 설치 파일. 현재는
          컴포넌트 매개변수와 비주얼 스크립팅 검토 같은 다음 목표를 진행하고 있습니다. 진행 상황:{" "}
          <ExternalLink host={editor} href={PLANS_INDEX}>
            계획 문서
          </ExternalLink>
        </p>
      </section>
      {(editor.mode === "browser" || editor.mode === "memory") && <WebEditionFooter editor={editor} />}
    </div>
  );
});
