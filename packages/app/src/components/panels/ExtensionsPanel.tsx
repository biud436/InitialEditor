// 확장 패널 자리. registries.panels 에 등록된 패널을 차례로 그린다. 타일맵 확장의 팔레트와 레이어가 첫 예다 (E3).

import { observer } from "mobx-react-lite";
import type { ComponentType } from "react";
import { useEditor } from "../../editor/EditorContext";

export const ExtensionsPanel = observer(function ExtensionsPanel() {
  const editor = useEditor();
  const panels = [...editor.registries.panels.values()];
  if (panels.length === 0) {
    return (
      <div className="panel-body">
        <div className="panel-hint">확장 패널이 여기 열린다 (E3: 타일 팔레트, 레이어)</div>
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
