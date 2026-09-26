// 설정 대화상자 (도구 > 설정). 테마, 엔진 경로(E1 이 쓴다), 저장 시 리로드, 편집기(글꼴, 탭, 줄바꿈, 미니맵), 브리지 URL(브라우저 모드).

import { EDITOR_FONT_SIZE_RANGE, type ThemePreference } from "@initial-editor/core";
import { observer } from "mobx-react-lite";
import { useState } from "react";
import type { Editor } from "../editor/Editor";
import { useEditor } from "../editor/EditorContext";

const TAB_SIZES = [2, 4, 8];

const SettingsForm = observer(function SettingsForm({ onClose }: { onClose: () => void }) {
  const editor = useEditor();
  const s = editor.settings.settings;
  const update = (patch: Parameters<typeof editor.settings.update>[0]) => editor.settings.update(patch);
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
            <option value="system">시스템 설정 따라가기</option>
            <option value="dark">다크</option>
            <option value="light">라이트</option>
          </select>
        </div>
        <div className="form-row">
          <label htmlFor="settings-engine">엔진 경로</label>
          <input id="settings-engine" className="input" value={s.enginePath} placeholder="비우면 자동 탐색 (../Initial2D/build/Initial2D)" onChange={(e) => update({ enginePath: e.target.value })} />
          <div className="form-help">실행 버튼(E1)이 쓴다. 지금은 저장만 한다</div>
        </div>
        <div className="form-row">
          <label htmlFor="settings-reload">저장 시 리로드</label>
          <label className="checkbox">
            <input id="settings-reload" type="checkbox" checked={s.reloadOnSave} onChange={(e) => update({ reloadOnSave: e.target.checked })} /> 스크립트를 저장하면 실행 중인 게임에 push 한다 (E1)
          </label>
        </div>
        <div className="form-row">
          <label htmlFor="settings-font-size">편집기 글꼴 크기</label>
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
            {EDITOR_FONT_SIZE_RANGE.min}부터 {EDITOR_FONT_SIZE_RANGE.max}까지 (px). 스크립트 편집기에 바로 반영된다
          </div>
        </div>
        <div className="form-row">
          <label htmlFor="settings-tab-size">편집기 탭 크기</label>
          <select id="settings-tab-size" className="select" value={s.editorTabSize} onChange={(e) => update({ editorTabSize: Number(e.target.value) })} data-testid="settings-tab-size">
            {TAB_SIZES.map((n) => (
              <option key={n} value={n}>
                {n}칸
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
            <div className="form-help">다음에 프로젝트를 열 때 쓴다. 지금 연결: {editor.bridgeUrl ?? "(없음)"}</div>
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
