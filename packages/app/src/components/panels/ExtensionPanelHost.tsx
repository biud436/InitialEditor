// 확장 패널 하나의 도킹 탭 (docs/plans/e5-rpg.md 2.1). params.panelId 로 등록된 패널을 찾아 그 컴포넌트를 그린다.
// 확장이 해제되어 패널이 없으면 무엇이 있던 자리인지 알린다.

import type { IDockviewPanelProps } from "dockview";
import { observer } from "mobx-react-lite";
import type { ComponentType } from "react";
import { useEditor } from "../../editor/EditorContext";
import type { ExtPanelParams } from "../../editor/layoutPresets";

export const ExtensionPanelHost = observer(function ExtensionPanelHost(props: IDockviewPanelProps<ExtPanelParams>) {
  const editor = useEditor();
  const id = props.params?.panelId ?? "";
  const spec = editor.registries.panels.get(id);
  if (!spec) {
    return (
      <div className="panel-body">
        <div className="panel-hint" data-testid="extension-panel-missing">
          확장 패널 {id} 을(를) 등록한 확장이 없다
        </div>
      </div>
    );
  }
  const Component = spec.Component as ComponentType;
  return (
    <div className="panel-body extension-panel-host" data-testid="extension-panel" data-panel={id}>
      <Component />
    </div>
  );
});
