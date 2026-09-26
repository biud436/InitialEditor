// 설정 대화상자 (도구 > 설정). 테마, 엔진 경로(E1 이 쓴다), 저장 시 리로드, 브리지 URL(브라우저 모드).

import type { ThemePreference } from "@initial-editor/core";
import { observer } from "mobx-react-lite";
import type { Editor } from "../editor/Editor";
import { useEditor } from "../editor/EditorContext";

const SettingsForm = observer(function SettingsForm({ onClose }: { onClose: () => void }) {
  const editor = useEditor();
  const s = editor.settings.settings;
  const update = (patch: Parameters<typeof editor.settings.update>[0]) => editor.settings.update(patch);
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
