// 확장 패널 자리. 확장이 registerPanel로 등록한 패널을 차례로 그린다. 없으면 무엇이 오는 자리인지 알린다.

import { observer } from "mobx-react-lite";
import type { ComponentType } from "react";
import { useEditor } from "../../editor/EditorContext";

export const ExtensionsPanel = observer(function ExtensionsPanel() {
  const editor = useEditor();
  const panels = [...editor.registries.panels.values()];
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
      {panels.map((p) => {
        const Component = p.Component as ComponentType;
        return (
          <section key={p.id} className="extension-panel">
            <h3 className="extension-panel-title">{p.title}</h3>
            <Component />
          </section>
        );
      })}
    </div>
  );
});
