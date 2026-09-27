// 확장 패널 자리. 확장이 registerPanel로 등록한 패널은 저마다 제 탭이다 (docs/plans/e5-rpg.md 2.1). 여기는 그 목록이고
// 누르면 그 탭을 열거나 앞으로 가져온다. visible이 거짓인 패널(이 프로젝트에 해당하지 않는다)은 싣지 않는다.
// 보일 것이 없으면 무엇이 오는 자리인지 알린다.

import { observer } from "mobx-react-lite";
import { useEditor } from "../../editor/EditorContext";
import { extPanelId, isExtPanelVisible } from "../../editor/layoutPresets";

export const ExtensionsPanel = observer(function ExtensionsPanel() {
  const editor = useEditor();
  const panels = [...editor.registries.panels.values()].filter(isExtPanelVisible);
  if (panels.length === 0) {
    return (
      <div className="panel-body">
        <div className="panel-hint" data-testid="extensions-empty">
          확장이 registerPanel로 더한 패널이 여기 보인다. 지금 켠 확장에는 없다. 맵의 팔레트, 레이어, 맵 오브젝트는 맵 탭을 열면 따로 열린다 (창 메뉴)
        </div>
      </div>
    );
  }
  return (
    <div className="panel-body">
      <div className="panel-hint">확장 패널은 저마다 탭이다. 누르면 그 탭을 연다 (창 메뉴에도 있다)</div>
      {panels.map((p) => {
        const dockId = extPanelId(p.id);
        const open = editor.layout?.isPanelOpen(dockId) ?? false;
        return (
          <section key={p.id} className="extension-panel" data-testid="extension-panel-entry" data-panel={p.id}>
            <button type="button" className="btn extension-panel-title" onClick={() => editor.layout?.showPanel(dockId)} title={open ? "탭으로 가기" : "탭 열기"}>
              {p.title}
            </button>
            <span className="muted">{open ? "열림" : "닫힘"}</span>
          </section>
        );
      })}
    </div>
  );
});
