// 도움말 > 정보. 판, 커밋, 웹 엔진 커밋, 데스크톱 앱이 찾은 엔진(앱에 든 엔진이면 그 판), 모드, 제3자 고지, 웹판 열기(데스크톱) 또는 데스크톱 앱 받기(웹판) (e6-packaging.md 7.4).
// 바깥 링크는 모두 openExternal 을 거친다 (Tauri 웹뷰는 target="_blank" 를 무시한다).

import { observer } from "mobx-react-lite";
import { useEffect, useState } from "react";
import { APP_COMMIT, EDITOR_NOTICES_URL, editionLink, ENGINE_NOTICES_FILE, ENGINE_README_API, foundEngineText, loadEngineNotices, PLANS_INDEX } from "../editor/about";
import { MODE_LABELS, type BackendMode } from "../editor/backends";
import type { EngineManifest } from "../editor/gameView/engineAssets";
import type { ModalStore } from "../editor/modals";
import { defaultOpenDeps, type OpenExternalDeps, type OpenLinkHost } from "../editor/openExternal";
import { ExternalLink } from "./ExternalLink";
import "./AboutDialog.css";

/** 정보 창이 에디터에서 보는 것 (테스트는 가짜를 넘긴다) */
export interface AboutHost extends OpenLinkHost {
  mode: BackendMode;
  version: string;
  platform: string;
  modals: ModalStore;
  /** 웹 엔진 (engine/MANIFEST.json). 없으면 웹 엔진 줄에 그렇다고 적는다 */
  gameView?: { loadFeatures(): Promise<string[]>; manifest: EngineManifest | null } | null;
  /** 프로세스 실행의 엔진 (데스크톱 앱에서만 줄을 보인다) */
  runner?: { engineDescription: string | null; resolving: boolean } | null;
  project?: { isOpen: boolean };
}

export interface AboutDeps {
  open?: OpenExternalDeps;
  /** 엔진 제3자 고지 읽기 (기본 engine/THIRD-PARTY.md) */
  notices?: () => Promise<string>;
}

type LoadState = { kind: "loading" } | { kind: "ready"; text: string } | { kind: "error"; text: string };

function errorMessage(e: unknown): string {
  return e instanceof Error ? e.message : String(e);
}

/** "179cecc (lua mruby wasm)" */
export function webEngineText(manifest: EngineManifest): string {
  const commit = manifest.engineCommit ? manifest.engineCommit.slice(0, 7) : "커밋 정보 없음";
  const dirty = manifest.engineDirty ? ", 커밋 안 된 변경" : "";
  return `${commit} (${manifest.features.join(" ")}${dirty})`;
}

const AboutBody = observer(function AboutBody({ host, deps, close }: { host: AboutHost; deps: AboutDeps; close: () => void }) {
  const [engine, setEngine] = useState<LoadState>({ kind: "loading" });
  useEffect(() => {
    const view = host.gameView;
    if (!view) {
      setEngine({ kind: "error", text: "웹 엔진 없음" });
      return;
    }
    let alive = true;
    view
      .loadFeatures()
      .then(() => {
        if (alive) setEngine(view.manifest ? { kind: "ready", text: webEngineText(view.manifest) } : { kind: "error", text: "MANIFEST 없음" });
      })
      .catch((e: unknown) => {
        if (alive) setEngine({ kind: "error", text: `읽기 실패: ${errorMessage(e)}` });
      });
    return () => {
      alive = false;
    };
  }, [host]);
  const edition = editionLink(host.mode);
  const open = deps.open ?? defaultOpenDeps;
  return (
    <>
      <div className="modal-body about" data-testid="about-dialog">
        <p>
          <strong>InitialEditor {host.version}</strong>
        </p>
        <p>Initial2D 엔진용 편집기. 프로젝트 열기, 씬에 오브젝트 배치, 스크립트 작성, 실행 버튼으로 게임 실행</p>
        <dl className="about-facts">
          <dt>판</dt>
          <dd data-testid="about-version">{host.version}</dd>
          <dt>커밋</dt>
          <dd data-testid="about-commit">{APP_COMMIT}</dd>
          <dt>웹 엔진</dt>
          <dd data-testid="about-web-engine" data-state={engine.kind}>
            {engine.kind === "loading" ? "읽는 중" : engine.text}
          </dd>
          {host.mode === "tauri" && host.runner && (
            <>
              <dt>엔진</dt>
              <dd data-testid="about-engine">{foundEngineText(host.runner, host.project?.isOpen ?? false)}</dd>
            </>
          )}
          <dt>모드</dt>
          <dd data-testid="about-mode">
            {MODE_LABELS[host.mode]}, 플랫폼 {host.platform}
          </dd>
        </dl>
        <div className="about-links">
          <ExternalLink host={host} href={edition.url} testId="about-edition" deps={open}>
            {edition.label}
          </ExternalLink>
          <button type="button" className="btn btn-ghost" data-testid="about-notices" onClick={() => void openNoticesDialog(host, deps)}>
            제3자 고지
          </button>
          <ExternalLink host={host} href={PLANS_INDEX} testId="about-plans" deps={open}>
            계획 문서
          </ExternalLink>
          <ExternalLink host={host} href={ENGINE_README_API} testId="about-api" deps={open}>
            엔진 API 대응표
          </ExternalLink>
        </div>
      </div>
      <div className="modal-actions">
        <button type="button" className="btn btn-primary" onClick={close} data-autofocus>
          닫기
        </button>
      </div>
    </>
  );
});

export function openAboutDialog(host: AboutHost, deps: AboutDeps = {}): Promise<void> {
  return host.modals.custom({
    title: "InitialEditor 정보",
    width: 480,
    render: (close) => <AboutBody host={host} deps={deps} close={close} />,
  });
}

function NoticesBody({ host, deps, close }: { host: AboutHost; deps: AboutDeps; close: () => void }) {
  const [state, setState] = useState<LoadState>({ kind: "loading" });
  useEffect(() => {
    let alive = true;
    (deps.notices ?? (() => loadEngineNotices()))()
      .then((text) => {
        if (alive) setState({ kind: "ready", text });
      })
      .catch((e: unknown) => {
        if (alive) setState({ kind: "error", text: errorMessage(e) });
      });
    return () => {
      alive = false;
    };
  }, [deps]);
  return (
    <>
      <div className="modal-body about-notices" data-testid="notices-dialog">
        <p className="muted">
          엔진(네이티브와 웹)에 포함된 제3자 소프트웨어 고지 (engine/{ENGINE_NOTICES_FILE}). 에디터가 쓰는 라이브러리의 고지:{" "}
          <ExternalLink host={host} href={EDITOR_NOTICES_URL} testId="notices-editor" deps={deps.open ?? defaultOpenDeps}>
            저장소의 src-tauri/licenses
          </ExternalLink>
        </p>
        {state.kind === "loading" && <p className="muted">읽는 중</p>}
        {state.kind === "error" && (
          <p className="about-error" data-testid="notices-error">
            {state.text}
          </p>
        )}
        {state.kind === "ready" && (
          <pre className="about-notices-text" data-testid="notices-text">
            {state.text}
          </pre>
        )}
      </div>
      <div className="modal-actions">
        <button type="button" className="btn btn-primary" onClick={close} data-autofocus>
          닫기
        </button>
      </div>
    </>
  );
}

export function openNoticesDialog(host: AboutHost, deps: AboutDeps = {}): Promise<void> {
  return host.modals.custom({ title: "제3자 고지", width: 720, render: (close) => <NoticesBody host={host} deps={deps} close={close} /> });
}
