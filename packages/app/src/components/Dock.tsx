// dockview 로 패널 자리 여섯을 놓는다: 계층, 프로젝트, 문서 탭(가운데), 인스펙터, 확장 패널, 콘솔.
// 레이아웃의 저장과 복원과 프리셋은 editor/layout.ts, 문서 탭 동기화는 editor/documentDock.ts.

import { DockviewReact, type DockviewReadyEvent, type DockviewTheme, type IDockviewPanelHeaderProps, type IDockviewPanelProps } from "dockview";
import "dockview/dist/styles/dockview.css";
import "../theme/dockview.css";
import type { FunctionComponent } from "react";
import { useCallback } from "react";
import { DOCUMENT_COMPONENT, DOCUMENT_TAB } from "../editor/documentDock";
import { useEditor } from "../editor/EditorContext";
import { DocumentPanel } from "./panels/DocumentPanel";
import { DocumentTab } from "./DocumentTab";
import { ConsolePanel } from "./panels/ConsolePanel";
import { ExtensionsPanel } from "./panels/ExtensionsPanel";
import { FindPanel } from "./panels/FindPanel";
import { HierarchyPanel } from "./panels/HierarchyPanel";
import { InspectorPanel } from "./panels/InspectorPanel";
import { ProjectPanel } from "./panels/ProjectPanel";
import "./Dock.css";

/** 자체 테마 클래스 대신 우리 토큰을 매핑한 클래스 (theme/dockview.css) */
const THEME: DockviewTheme = { name: "initial", className: "initial-dockview", gap: 0 };

const components: Record<string, FunctionComponent<IDockviewPanelProps>> = {
  hierarchy: HierarchyPanel,
  project: ProjectPanel,
  inspector: InspectorPanel,
  extensions: ExtensionsPanel,
  console: ConsolePanel,
  find: FindPanel,
  [DOCUMENT_COMPONENT]: DocumentPanel,
};

const tabComponents: Record<string, FunctionComponent<IDockviewPanelHeaderProps>> = {
  [DOCUMENT_TAB]: DocumentTab,
};

export function Dock() {
  const editor = useEditor();
  const onReady = useCallback((e: DockviewReadyEvent) => editor.layout.attach(e.api), [editor]);
  return (
    <div className="app-dock" data-testid="dock">
      <DockviewReact className="dock" theme={THEME} components={components} tabComponents={tabComponents} onReady={onReady} />
    </div>
  );
}
