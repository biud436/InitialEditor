// @vitest-environment jsdom
import { MemorySettingsStorage, SettingsStore } from "@initial-editor/core";
import { describe, expect, it } from "vitest";
import { ThemeController, type AppliedTheme, type SystemThemeSource } from "./ThemeController";

function fakeSource(initial: AppliedTheme) {
  let current = initial;
  const listeners = new Set<(t: AppliedTheme) => void>();
  const source: SystemThemeSource = {
    current: () => current,
    subscribe(listener) {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
  };
  return {
    source,
    set(theme: AppliedTheme) {
      current = theme;
      for (const l of listeners) l(theme);
    },
    get listenerCount() {
      return listeners.size;
    },
  };
}

describe("ThemeController", () => {
  it("system 은 OS 테마를 따라가고 바뀌면 바로 반영한다", () => {
    const settings = new SettingsStore(new MemorySettingsStorage());
    const os = fakeSource("light");
    const target = { dataset: {} as Record<string, string | undefined> };
    const controller = new ThemeController(settings, target, os.source);
    controller.start();
    expect(target.dataset.theme).toBe("light");
    expect(controller.applied).toBe("light");
    os.set("dark");
    expect(target.dataset.theme).toBe("dark");
    controller.dispose();
    expect(os.listenerCount).toBe(0);
  });

  it("dark 와 light 는 고정이고 OS 가 바뀌어도 안 따라간다", () => {
    const settings = new SettingsStore(new MemorySettingsStorage());
    const os = fakeSource("light");
    const target = { dataset: {} as Record<string, string | undefined> };
    const controller = new ThemeController(settings, target, os.source);
    controller.start();
    settings.update({ theme: "dark" });
    expect(target.dataset.theme).toBe("dark");
    os.set("light");
    expect(target.dataset.theme).toBe("dark");
    settings.update({ theme: "light" });
    expect(target.dataset.theme).toBe("light");
    os.set("dark");
    expect(target.dataset.theme).toBe("light");
    settings.update({ theme: "system" });
    expect(target.dataset.theme).toBe("dark");
    controller.dispose();
  });

  it("document.documentElement 에 data-theme 를 쓴다", () => {
    const settings = new SettingsStore(new MemorySettingsStorage());
    const os = fakeSource("dark");
    const controller = new ThemeController(settings, document.documentElement, os.source);
    controller.start();
    expect(document.documentElement.dataset.theme).toBe("dark");
    settings.update({ theme: "light" });
    expect(document.documentElement.getAttribute("data-theme")).toBe("light");
    controller.dispose();
  });
});
