// 시작 탭: 새 프로젝트와 열기, 최근 프로젝트, 시작하기 네 단계와 도움말 링크.
// 브라우저 폴더 모드(웹판)는 폴더 열기, 새 프로젝트, 샘플 프로젝트, 최근 폴더 다시 열기 (BrowserFoldersSection).
// 웹판(브라우저 폴더, 메모리)은 아래에 데스크톱 앱 받기와 웹판에서 안 되는 것 한 줄.
// 바깥 링크는 openExternal 을 거친다 (ExternalLink).

import { observer } from "mobx-react-lite";
import { useEffect, useState, type ReactNode } from "react";
import { editionLink, ENGINE_README_API, guidePage, USER_GUIDE, webLimits } from "../../editor/about";
import { isFolderFallback, SAMPLE_ROOT, type BackendMode } from "../../editor/backends";
import { browserFolders, openSampleMap } from "../../editor/browserFolders";
import { useEditor } from "../../editor/EditorContext";
import type { Editor } from "../../editor/Editor";
import { ExternalLink } from "../ExternalLink";
import "./WelcomeView.css";

/** 모드마다 알아야 할 것 (데스크톱 앱과 브라우저 폴더는 없다) */
const MODE_NOTICE: Partial<Record<BackendMode, string>> = {
  memory: "샘플 프로젝트는 브라우저 메모리에 있습니다. 페이지를 다시 열면 처음 상태로 돌아갑니다.",
  bridge: "브리지 서버로 연결한 프로젝트를 편집합니다. 게임은 게임 탭에서 실행합니다.",
};

const FALLBACK_NOTICE = "이 브라우저는 폴더 열기를 지원하지 않아 샘플 프로젝트로 시작했습니다. 샘플은 브라우저 메모리에 있어 페이지를 다시 열면 처음 상태로 돌아갑니다. 로컬 폴더는 크롬이나 엣지에서 열 수 있습니다.";
const NO_PICKER = "이 브라우저는 폴더 열기를 지원하지 않습니다 (크롬과 엣지에서 지원합니다)";

/** 경로의 마지막 이름 (최근 프로젝트의 제목) */
export function projectName(root: string): string {
  const parts = root.replace(/[\\/]+$/, "").split(/[\\/]/);
  return parts[parts.length - 1] || root;
}

function ActionButton({ label, shortcut, primary, disabled, title, onClick }: { label: string; shortcut?: string; primary?: boolean; disabled?: boolean; title?: string; onClick(): void }) {
  return (
    <button type="button" className={`welcome-action${primary ? " primary" : ""}`} aria-label={label} title={title} disabled={disabled} onClick={onClick}>
      <span className="welcome-action-label">{label}</span>
      {shortcut && <kbd className="welcome-kbd">{shortcut}</kbd>}
    </button>
  );
}

function Section({ title, children, testId }: { title: string; children: ReactNode; testId?: string }) {
  return (
    <section className="welcome-section" data-testid={testId}>
      <h2>{title}</h2>
      {children}
    </section>
  );
}

const BrowserFoldersSection = observer(function BrowserFoldersSection({ editor }: { editor: Editor }) {
  const folders = browserFolders(editor);
  return (
    <>
      <Section title="시작">
        <div className="welcome-actions">
          <ActionButton
            label="폴더 열기"
            primary
            disabled={!folders.supported}
            title={folders.supported ? "game.json 이 있는 프로젝트 폴더를 엽니다" : NO_PICKER}
            onClick={() => void folders.openNew()}
          />
          <ActionButton
            label="새 프로젝트"
            disabled={!folders.supported}
            title={folders.supported ? "폴더를 선택하고 템플릿으로 새 프로젝트를 만듭니다" : NO_PICKER}
            onClick={() => void editor.commands.execute("file.newProject")}
          />
          <ActionButton label="샘플 프로젝트 열기" disabled={folders.openingSample} onClick={() => void folders.openSample()} />
        </div>
        {!folders.supported && <p className="welcome-notice">{NO_PICKER}</p>}
      </Section>
      <Section title="최근 폴더">
        {folders.records.length === 0 ? (
          <p className="muted">{folders.loaded ? "최근 폴더 없음" : "불러오는 중"}</p>
        ) : (
          <ul className="welcome-recent" data-testid="welcome-recent-folders">
            {folders.records.map((record) => (
              <li key={record.key}>
                <button type="button" className="welcome-recent-open" title={record.name} aria-label={`${record.name} 다시 열기`} onClick={() => void folders.reopen(record)}>
                  <span className="welcome-recent-name">{record.name}</span>
                  <span className="welcome-recent-path">다시 열기</span>
                </button>
                <button type="button" className="btn btn-ghost welcome-recent-remove" aria-label={`최근 폴더 목록에서 제거: ${record.name}`} onClick={() => void folders.forget(record.key)}>
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
        {folders.records.length > 0 && <p className="muted welcome-hint">브라우저가 폴더 권한을 기억하지 않으면 다시 열 때 권한을 묻습니다.</p>}
      </Section>
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
    <footer className="welcome-footer" data-testid="welcome-web">
      <ExternalLink host={editor} href={link.url} testId="welcome-edition">
        {link.label}
      </ExternalLink>
      <span className="muted" data-testid="welcome-web-limits">
        데스크톱 앱에서만 되는 기능: {webLimits(features).join(", ")}
      </span>
    </footer>
  );
});

/** 시작하기: 처음 쓰는 사람이 할 일 네 가지와 가이드의 해당 문서 */
const GettingStarted = observer(function GettingStarted({ editor }: { editor: Editor }) {
  const key = (id: string) => editor.commands.formatShortcut(id);
  const steps: Array<{ title: string; text: string; page: string }> = [
    { title: "새 프로젝트", text: "템플릿(빈 프로젝트, 플래피버드, 타일맵, RPG 데모)과 스크립트 언어(Lua, Ruby)를 선택하면 바로 실행되는 프로젝트가 만들어집니다.", page: "first-project.md" },
    { title: "씬 편집", text: "씬 뷰에 스프라이트와 텍스트를 배치하고, 인스펙터에서 위치와 컴포넌트를 정합니다.", page: "scenes.md" },
    { title: "스크립트 편집", text: "컴포넌트 스크립트를 편집하고 저장하면 실행 중인 게임에 바로 반영됩니다.", page: "scripts.md" },
    { title: "게임 실행", text: `${key("run.start") || "F5"} 로 게임을 실행합니다. 콘솔의 오류 줄을 누르면 그 스크립트의 그 줄로 이동합니다.`, page: "running.md" },
  ];
  return (
    <Section title="시작하기" testId="welcome-steps">
      <ol className="welcome-steps">
        {steps.map((s) => (
          <li key={s.page}>
            <ExternalLink host={editor} href={guidePage(s.page)} className="welcome-step-title">
              {s.title}
            </ExternalLink>
            <p>{s.text}</p>
          </li>
        ))}
      </ol>
    </Section>
  );
});

const HelpLinks = observer(function HelpLinks({ editor }: { editor: Editor }) {
  const guideKey = editor.commands.formatShortcut("help.guide");
  return (
    <Section title="도움말" testId="welcome-help">
      <ul className="welcome-links">
        <li>
          <ExternalLink host={editor} href={USER_GUIDE} testId="welcome-guide">
            사용자 가이드
          </ExternalLink>
          {guideKey && <kbd className="welcome-kbd">{guideKey}</kbd>}
        </li>
        <li>
          <ExternalLink host={editor} href={guidePage("shortcuts.md")}>
            단축키
          </ExternalLink>
        </li>
        <li>
          <ExternalLink host={editor} href={ENGINE_README_API}>
            엔진 API 레퍼런스
          </ExternalLink>
        </li>
      </ul>
    </Section>
  );
});

export const WelcomeView = observer(function WelcomeView() {
  const editor = useEditor();
  const recent = editor.settings.settings.recentProjects;
  const run = (id: string) => void editor.commands.execute(id);
  const key = (id: string) => editor.commands.formatShortcut(id);
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
  const notice = fallback ? FALLBACK_NOTICE : MODE_NOTICE[editor.mode];
  return (
    <div className="welcome" data-testid="welcome">
      <header className="welcome-header">
        <h1 className="welcome-title">InitialEditor</h1>
        <span className="welcome-version">{editor.version}</span>
      </header>
      <p className="welcome-tagline">Initial2D 게임 에디터</p>
      {notice && <p className="welcome-notice">{notice}</p>}
      <div className="welcome-columns">
        <div className="welcome-main">
          {editor.mode === "browser" ? (
            <BrowserFoldersSection editor={editor} />
          ) : (
            <Section title="시작">
              <div className="welcome-actions">
                {editor.mode === "memory" ? (
                  <ActionButton label="샘플 프로젝트 열기" primary disabled={openingSample} onClick={() => void openMemorySample()} />
                ) : (
                  <>
                    {editor.mode === "tauri" && <ActionButton label="새 프로젝트" shortcut={key("file.newProject")} primary onClick={() => run("file.newProject")} />}
                    <ActionButton label="프로젝트 열기" shortcut={key("file.openProject")} primary={editor.mode !== "tauri"} onClick={() => run("file.openProject")} />
                  </>
                )}
              </div>
            </Section>
          )}
          {(editor.mode === "bridge" || editor.mode === "tauri") && (
            <Section title="최근 프로젝트">
              {recent.length === 0 ? (
                <p className="muted">최근 프로젝트 없음</p>
              ) : (
                <ul className="welcome-recent" data-testid="welcome-recent">
                  {recent.map((root) => (
                    <li key={root}>
                      <button type="button" className="welcome-recent-open" title={root} onClick={() => void editor.openProject(root)}>
                        <span className="welcome-recent-name">{projectName(root)}</span>
                        <span className="welcome-recent-path">{root}</span>
                      </button>
                      <button type="button" className="btn btn-ghost welcome-recent-remove" aria-label={`최근 프로젝트 목록에서 제거: ${root}`} onClick={() => editor.settings.removeRecentProject(root)}>
                        ×
                      </button>
                    </li>
                  ))}
                </ul>
              )}
            </Section>
          )}
        </div>
        <aside className="welcome-side">
          <GettingStarted editor={editor} />
          <HelpLinks editor={editor} />
        </aside>
      </div>
      {(editor.mode === "browser" || editor.mode === "memory") && <WebEditionFooter editor={editor} />}
    </div>
  );
});
