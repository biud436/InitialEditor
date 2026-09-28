// 설정 대화상자 (도구 > 설정). 테마, 실행 방식(E4), 엔진 경로(E1 이 쓴다), 찾은 엔진과 신뢰 취소(E6), 저장 시 리로드,
// 엔진 저장소(E6 안드로이드 스테이징), 편집기(글꼴, 탭, 줄바꿈, 미니맵), 브리지 URL(브라우저 모드).
// 실행 방식은 프로세스를 띄울 수 있는 백엔드(Tauri)에서만 고른다.

import { EDITOR_FONT_SIZE_RANGE, type RunMode, type ThemePreference } from "@initial-editor/core";
import { observer } from "mobx-react-lite";
import { useState } from "react";
import { foundEngineText } from "../editor/about";
import type { Editor } from "../editor/Editor";
import { useEditor } from "../editor/EditorContext";

const TAB_SIZES = [2, 4, 8];

/** 찾은 엔진 한 줄과, 열린 프로젝트가 가리키는 엔진에 대한 답(신뢰 취소, 다시 묻기) */
export const FoundEngineRow = observer(function FoundEngineRow() {
  const editor = useEditor();
  const runner = editor.runner;
  const trust = runner.trustRecord;
  const found = foundEngineText(runner, editor.project.isOpen);
  return (
    <div className="form-row">
      <label>찾은 엔진</label>
      <div data-testid="settings-found-engine">{found}</div>
      {trust && (
        <div className="form-help" data-testid="settings-engine-trust">
          이 프로젝트가 가리키는 엔진: {trust.allow ? "실행 허용" : "실행하지 않음"} ({trust.exes.join(", ")}){" "}
          <button type="button" className="btn btn-ghost" onClick={() => void (trust.allow ? runner.revokeTrust() : runner.askTrustAgain())} data-testid="settings-engine-trust-reset">
            {trust.allow ? "신뢰 취소" : "다시 묻기"}
          </button>
        </div>
      )}
    </div>
  );
});

/** 안드로이드 스테이징의 엔진 저장소 (E6 6.3) 와, 열린 프로젝트에서 허용한 스테이징 스크립트의 신뢰 취소 */
export const EngineRepoRow = observer(function EngineRepoRow() {
  const editor = useEditor();
  const settings = editor.settings;
  const root = editor.project.isOpen ? editor.project.root : null;
  const trust = root ? settings.settings.androidTrust[root] : undefined;
  const revoke = () => {
    if (!root) return;
    const rest = { ...settings.settings.androidTrust };
    delete rest[root];
    settings.update({ androidTrust: rest });
  };
  return (
    <div className="form-row">
      <label htmlFor="settings-engine-repo">엔진 저장소</label>
      <input
        id="settings-engine-repo"
        className="input"
        value={settings.settings.engineRepoPath}
        placeholder="지정 안 함 (자동 탐색: 열린 프로젝트, 찾은 엔진의 저장소, 프로젝트 상위 폴더의 Initial2D)"
        onChange={(e) => settings.update({ engineRepoPath: e.target.value })}
        data-testid="settings-engine-repo"
      />
      <div className="form-help">안드로이드로 스테이징에 사용 (android/prepare_assets.sh 가 있는 Initial2D 체크아웃)</div>
      {trust?.allow && (
        <div className="form-help" data-testid="settings-android-trust">
          이 프로젝트에서 허용한 스테이징 스크립트: {trust.exes.join(", ")}{" "}
          <button type="button" className="btn btn-ghost" onClick={revoke} data-testid="settings-android-trust-reset">
            신뢰 취소
          </button>
        </div>
      )}
    </div>
  );
});

const SettingsForm = observer(function SettingsForm({ onClose }: { onClose: () => void }) {
  const editor = useEditor();
  const s = editor.settings.settings;
  const update = (patch: Parameters<typeof editor.settings.update>[0]) => editor.settings.update(patch);
  const canSpawn = editor.backend.capabilities.run;
  // 글꼴 크기는 치는 동안 범위 밖일 수 있어 칸의 글자는 따로 들고, 범위 안이면 바로 반영하고 나머지는 초점을 잃을 때
  const [fontText, setFontText] = useState(String(s.editorFontSize));
  const commitFont = (text: string) => {
    const n = Number(text);
    if (Number.isFinite(n) && n >= EDITOR_FONT_SIZE_RANGE.min && n <= EDITOR_FONT_SIZE_RANGE.max) update({ editorFontSize: n });
  };
  return (
    <>
      <div className="modal-body" data-testid="settings-dialog">
        <div className="form-row">
          <label htmlFor="settings-theme">테마</label>
          <select id="settings-theme" className="select" value={s.theme} onChange={(e) => update({ theme: e.target.value as ThemePreference })} data-autofocus data-testid="settings-theme">
            <option value="system">시스템 설정 사용</option>
            <option value="dark">다크</option>
            <option value="light">라이트</option>
          </select>
        </div>
        <div className="form-row">
          <label htmlFor="settings-run-mode">실행 방식</label>
          <select
            id="settings-run-mode"
            className="select"
            value={editor.runner.mode}
            disabled={!canSpawn}
            onChange={(e) => update({ runMode: e.target.value as RunMode })}
            data-testid="settings-run-mode"
          >
            <option value="process">프로세스 (엔진 실행 파일, 별도 창)</option>
            <option value="embedded">게임 탭 (웹 엔진)</option>
          </select>
          <div className="form-help">{canSpawn ? "F5로 게임을 실행할 위치. 게임 탭 실행은 웹 엔진 빌드에 포함된 언어(Lua, mruby)만 지원" : "브라우저에서는 항상 게임 탭에서 실행 (웹 엔진)"}</div>
        </div>
        <div className="form-row">
          <label htmlFor="settings-engine">엔진 경로</label>
          <input id="settings-engine" className="input" value={s.enginePath} placeholder="지정 안 함 (자동 탐색: 프로젝트의 build/, 앱에 든 엔진, 프로젝트 상위 폴더의 Initial2D/build/)" onChange={(e) => update({ enginePath: e.target.value })} />
          <div className="form-help">실행 방식이 프로세스일 때 사용</div>
        </div>
        {canSpawn && <FoundEngineRow />}
        {canSpawn && <EngineRepoRow />}
        <div className="form-row">
          <label htmlFor="settings-reload">저장 시 리로드</label>
          <label className="checkbox">
            <input id="settings-reload" type="checkbox" checked={s.reloadOnSave} onChange={(e) => update({ reloadOnSave: e.target.checked })} /> 스크립트, 씬, 맵 저장 시 실행 중인 게임에 핫 리로드
          </label>
        </div>
        <div className="form-row">
          <label htmlFor="settings-font-size">편집기 폰트 크기</label>
          <input
            id="settings-font-size"
            className="input"
            type="number"
            min={EDITOR_FONT_SIZE_RANGE.min}
            max={EDITOR_FONT_SIZE_RANGE.max}
            value={fontText}
            onChange={(e) => {
              setFontText(e.target.value);
              commitFont(e.target.value);
            }}
            onBlur={() => {
              commitFont(fontText);
              setFontText(String(editor.settings.settings.editorFontSize));
            }}
            data-testid="settings-font-size"
          />
          <div className="form-help">
            {EDITOR_FONT_SIZE_RANGE.min}부터 {EDITOR_FONT_SIZE_RANGE.max}까지 (px). 스크립트 편집기에 즉시 반영
          </div>
        </div>
        <div className="form-row">
          <label htmlFor="settings-tab-size">편집기 탭 크기</label>
          <select id="settings-tab-size" className="select" value={s.editorTabSize} onChange={(e) => update({ editorTabSize: Number(e.target.value) })} data-testid="settings-tab-size">
            {TAB_SIZES.map((n) => (
              <option key={n} value={n}>
                공백 {n}개
              </option>
            ))}
          </select>
        </div>
        <div className="form-row">
          <label>편집기 표시</label>
          <label className="checkbox">
            <input type="checkbox" checked={s.editorWordWrap} onChange={(e) => update({ editorWordWrap: e.target.checked })} data-testid="settings-word-wrap" /> 자동 줄바꿈
          </label>
          <label className="checkbox">
            <input type="checkbox" checked={s.editorMinimap} onChange={(e) => update({ editorMinimap: e.target.checked })} data-testid="settings-minimap" /> 미니맵
          </label>
        </div>
        {editor.isBrowser && (
          <div className="form-row">
            <label htmlFor="settings-bridge">브리지 URL</label>
            <input id="settings-bridge" className="input" value={s.bridgeUrl} placeholder="http://127.0.0.1:5960" onChange={(e) => update({ bridgeUrl: e.target.value })} />
            <div className="form-help">다음 프로젝트 열기부터 적용. 현재 연결: {editor.bridgeUrl ?? "(없음)"}</div>
          </div>
        )}
      </div>
      <div className="modal-actions">
        <button type="button" className="btn btn-primary" onClick={onClose}>
          닫기
        </button>
      </div>
    </>
  );
});

export function openSettingsDialog(editor: Editor): Promise<void> {
  return editor.modals.custom({ title: "설정", width: 520, render: (close) => <SettingsForm onClose={close} /> });
}
