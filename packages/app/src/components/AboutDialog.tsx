// 도움말 > 정보. 버전과 모드와 계획 문서 링크.

import type { Editor } from "../editor/Editor";
import { MODE_LABELS } from "../editor/backends";
import { ENGINE_README_API, PLANS_INDEX } from "../editor/appCommands";

export function openAboutDialog(editor: Editor): Promise<void> {
  return editor.modals.custom({
    title: "InitialEditor 정보",
    render: (close) => (
      <>
        <div className="modal-body" data-testid="about-dialog">
          <p>
            <strong>InitialEditor {editor.version}</strong>
          </p>
          <p>Initial2D 엔진의 편집기. 프로젝트를 열고 씬에 오브젝트를 놓고 스크립트를 쓰고 실행 버튼을 누르면 게임이 돈다.</p>
          <p className="muted">
            모드: {MODE_LABELS[editor.mode]}, 플랫폼: {editor.platform}
          </p>
          <p>
            <a href={PLANS_INDEX} target="_blank" rel="noreferrer">
              계획 문서
            </a>
            {" / "}
            <a href={ENGINE_README_API} target="_blank" rel="noreferrer">
              엔진 API 대응표
            </a>
          </p>
        </div>
        <div className="modal-actions">
          <button type="button" className="btn btn-primary" onClick={close} data-autofocus>
            닫기
          </button>
        </div>
      </>
    ),
  });
}
