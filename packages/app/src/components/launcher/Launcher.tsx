// 시작 창 (docs/plans/quality.md Q1). 게임이 열려 있지 않으면 작업 화면 대신 이 창을 띄운다.
// 왼쪽은 새 게임과 열기와 도움말, 오른쪽은 최근 게임(데스크톱, 브리지)이나 최근 폴더(웹판)와 샘플 게임이다.
// 모드마다 할 수 있는 것이 달라 단추가 달라진다: 메모리 모드는 샘플만, 브리지는 열기만, 데스크톱과 웹판은 새 게임까지.

import { observer } from "mobx-react-lite";
import { useState } from "react";
import { BookOpen, FilePlus2, FolderOpen, Gamepad2, Keyboard, Monitor, Settings, X } from "lucide-react";
import { Button, EmptyState, IconButton, RowButton } from "@initial-editor/ui";
import { editionLink } from "../../editor/about";
import { isFolderFallback, SAMPLE_ROOT } from "../../editor/backends";
import { browserFolders, openSampleMap } from "../../editor/browserFolders";
import { useEditor } from "../../editor/EditorContext";
import type { Editor } from "../../editor/Editor";
import { LAUNCHER } from "../../editor/launcherText";
import { newProjectBlocker } from "../../editor/newProject";
import { openLink } from "../../editor/openExternal";
import rpgPreview from "./previews/rpg.png";
import "./Launcher.css";

/** 경로의 마지막 이름 (최근 게임의 이름) */
export function folderName(root: string): string {
  const parts = root.replace(/[\\/]+$/, "").split(/[\\/]/);
  return parts[parts.length - 1] || root;
}

/** 긴 경로는 가운데를 줄인다 (앞의 드라이브와 끝의 폴더 이름이 남는다) */
export function shortenPath(path: string, max = 56): string {
  const home = path.replace(/^\/Users\/[^/]+|^\/home\/[^/]+|^[A-Za-z]:\\Users\\[^\\]+/, "~");
  if (home.length <= max) return home;
  const keep = Math.floor((max - 1) / 2);
  return `${home.slice(0, keep)}…${home.slice(home.length - keep)}`;
}

function RecentRow({ name, detail, onOpen, onRemove }: { name: string; detail: string; onOpen(): void; onRemove(): void }) {
  return (
    <li>
      <RowButton icon={Gamepad2} title={name} detail={detail} tooltip={detail} onClick={onOpen} actions={<IconButton icon={X} label={LAUNCHER.removeRecent} size="sm" onClick={onRemove} />} />
    </li>
  );
}

const SampleCard = observer(function SampleCard({ editor, memory }: { editor: Editor; memory: boolean }) {
  const [opening, setOpening] = useState(false);
  const open = async () => {
    if (opening) return;
    setOpening(true);
    try {
      if (editor.mode === "browser") await browserFolders(editor).openSample();
      else if ((await editor.openProject(SAMPLE_ROOT)) && isFolderFallback(editor.mode)) await openSampleMap(editor);
    } finally {
      setOpening(false);
    }
  };
  return (
    <section className="launcher-sample" aria-label="샘플 게임">
      <img className="launcher-sample-image" src={rpgPreview} alt="" />
      <div className="launcher-sample-body">
        <div className="launcher-sample-title">{LAUNCHER.sampleTitle}</div>
        <p className="launcher-sample-desc">{LAUNCHER.sampleDescription}</p>
        {memory && <p className="launcher-sample-note">{LAUNCHER.sampleMemoryNote}</p>}
        <Button variant={memory ? "primary" : "default"} onClick={() => void open()} disabled={opening}>
          {LAUNCHER.openSample}
        </Button>
      </div>
    </section>
  );
});

const RecentGames = observer(function RecentGames({ editor }: { editor: Editor }) {
  const recent = editor.settings.settings.recentProjects;
  return (
    <section className="launcher-section" aria-labelledby="launcher-recent-title">
      <h2 id="launcher-recent-title" className="launcher-heading">
        {LAUNCHER.recent}
      </h2>
      {recent.length === 0 ? (
        <div className="launcher-empty">
          <EmptyState icon={Gamepad2} title={LAUNCHER.recentEmpty} description={LAUNCHER.recentEmptyHint} />
        </div>
      ) : (
        <ul className="launcher-recent" data-testid="launcher-recent">
          {recent.map((root) => (
            <RecentRow key={root} name={folderName(root)} detail={shortenPath(root)} onOpen={() => void editor.openProject(root)} onRemove={() => editor.settings.removeRecentProject(root)} />
          ))}
        </ul>
      )}
    </section>
  );
});

const RecentFolders = observer(function RecentFolders({ editor }: { editor: Editor }) {
  const folders = browserFolders(editor);
  return (
    <section className="launcher-section" aria-labelledby="launcher-folders-title">
      <h2 id="launcher-folders-title" className="launcher-heading">
        {LAUNCHER.recentFolders}
      </h2>
      {folders.records.length === 0 ? (
        <div className="launcher-empty">
          <EmptyState icon={Gamepad2} title={folders.loaded ? LAUNCHER.recentEmpty : "불러오는 중"} description={folders.loaded ? LAUNCHER.recentEmptyHint : undefined} />
        </div>
      ) : (
        <ul className="launcher-recent" data-testid="launcher-recent-folders">
          {folders.records.map((record) => (
            <RecentRow key={record.key} name={record.name} detail={LAUNCHER.reopen} onOpen={() => void folders.reopen(record)} onRemove={() => void folders.forget(record.key)} />
          ))}
        </ul>
      )}
      {folders.records.length > 0 && folders.restoreNotice && (
        <p className="launcher-note" data-testid="launcher-restore-notice">
          {folders.restoreNotice}
        </p>
      )}
    </section>
  );
});

export const Launcher = observer(function Launcher() {
  const editor = useEditor();
  const key = (id: string) => editor.commands.formatShortcut(id) || undefined;
  const run = (id: string) => void editor.commands.execute(id);
  const mode = editor.mode;
  const browser = mode === "browser";
  const memory = mode === "memory";
  const canCreate = (mode === "tauri" || browser) && newProjectBlocker(editor) === null;
  const folders = browser ? browserFolders(editor) : null;
  const web = browser || memory;
  const edition = web ? editionLink(mode) : null;

  return (
    <div className="launcher" data-testid="launcher">
      <aside className="launcher-side">
        <div className="launcher-brand">
          <div className="launcher-name">InitialEditor</div>
          <div className="launcher-version">{editor.version}</div>
          <div className="launcher-tagline">{LAUNCHER.tagline}</div>
        </div>

        <div className="launcher-actions">
          {(mode === "tauri" || browser) && (
            <Button variant="primary" size="lg" icon={FilePlus2} shortcut={key("file.newProject")} disabled={!canCreate} onClick={() => run("file.newProject")}>
              {LAUNCHER.newGame}
            </Button>
          )}
          {browser ? (
            <Button size="lg" icon={FolderOpen} disabled={!folders?.supported} onClick={() => void folders?.openNew()}>
              {LAUNCHER.openFolder}
            </Button>
          ) : (
            !memory && (
              <Button size="lg" icon={FolderOpen} shortcut={key("file.openProject")} onClick={() => run("file.openProject")}>
                {LAUNCHER.openGame}
              </Button>
            )
          )}
          {browser && !folders?.supported && <p className="launcher-note">{LAUNCHER.noFolderAccess}</p>}
          {isFolderFallback(mode) && <p className="launcher-note">{LAUNCHER.fallbackNote}</p>}
        </div>

        <nav className="launcher-links" aria-label="도움말">
          <Button variant="ghost" icon={BookOpen} shortcut={key("help.guide")} className="launcher-link" onClick={() => run("help.guide")}>
            {LAUNCHER.guide}
          </Button>
          <Button variant="ghost" icon={Keyboard} className="launcher-link" onClick={() => run("help.shortcuts")}>
            {LAUNCHER.shortcuts}
          </Button>
          <Button variant="ghost" icon={Settings} shortcut={key("tools.settings")} className="launcher-link" onClick={() => run("tools.settings")}>
            {LAUNCHER.settings}
          </Button>
          {edition && (
            <Button variant="ghost" icon={Monitor} className="launcher-link" onClick={() => void openLink(editor, edition.url)}>
              {LAUNCHER.desktopApp}
            </Button>
          )}
        </nav>
      </aside>

      <main className="launcher-main">
        {(mode === "tauri" || mode === "bridge") && <RecentGames editor={editor} />}
        {browser && <RecentFolders editor={editor} />}
        {web && <SampleCard editor={editor} memory={memory} />}
      </main>
    </div>
  );
});
