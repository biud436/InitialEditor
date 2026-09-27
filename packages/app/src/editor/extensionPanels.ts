// 확장 패널의 창 메뉴 (docs/plans/e5-rpg.md 2.1). 확장이 registerPanel 로 등록한 패널마다 커맨드 window.panel.ext:<id> 와
// "창/<제목>" 메뉴를 둔다. 등록과 해제를 따라간다. 패널 자체는 제 도킹 탭이다 (layoutPresets.ts, components/panels/ExtensionPanelHost.tsx).

import type { CommandRegistry, ExtensionRegistries, MenuRegistry, PanelSpec } from "@initial-editor/core";
import { reaction } from "mobx";
import { extPanelId, PANEL_IDS, type ToolPanelId } from "./layoutPresets";

export interface ExtensionPanelHost {
  readonly registries: ExtensionRegistries;
  readonly commands: Pick<CommandRegistry, "register">;
  readonly menus: Pick<MenuRegistry, "register">;
  readonly layout: { togglePanel(id: ToolPanelId): void; isPanelOpen(id: ToolPanelId): boolean };
  setChecked(id: string, fn: () => boolean): void;
}

export function extPanelCommandId(id: string): string {
  return `window.panel.${extPanelId(id)}`;
}

export function registerExtensionPanelCommands(host: ExtensionPanelHost): () => void {
  const placed = new Map<string, { spec: PanelSpec; off: () => void }>();
  const sync = (specs: PanelSpec[]) => {
    for (const [id, entry] of [...placed]) {
      if (specs.includes(entry.spec)) continue;
      entry.off();
      placed.delete(id);
    }
    specs.forEach((spec, i) => {
      if (placed.has(spec.id)) return;
      const dockId = extPanelId(spec.id);
      const commandId = extPanelCommandId(spec.id);
      const offCommand = host.commands.register({ id: commandId, label: spec.title, category: "window", run: () => host.layout.togglePanel(dockId) });
      host.setChecked(commandId, () => host.layout.isPanelOpen(dockId));
      const offMenu = host.menus.register({ path: `창/${spec.title}`, commandId, order: 10 + PANEL_IDS.length + i });
      placed.set(spec.id, {
        spec,
        off: () => {
          offMenu();
          offCommand();
        },
      });
    });
  };
  const stop = reaction(() => [...host.registries.panels.values()], sync, { fireImmediately: true });
  return () => {
    stop();
    for (const entry of placed.values()) entry.off();
    placed.clear();
  };
}
