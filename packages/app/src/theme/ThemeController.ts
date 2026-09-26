// 테마 적용 (docs/plans/02-scope-and-screens.md 6절).
// settings.theme 가 "system" 이면 OS 의 prefers-color-scheme 을 따라가고 바뀌면 바로 반영한다.
// "dark" 와 "light" 는 고정이다. 결과는 <html data-theme> 하나이며 나머지는 tokens.css 가 한다.

import { action, makeObservable, observable, reaction } from "mobx";
import type { SettingsStore } from "@initial-editor/core";

export type AppliedTheme = "dark" | "light";

/** OS 테마의 출처. 브라우저는 matchMedia, 테스트는 가짜를 준다 */
export interface SystemThemeSource {
  current(): AppliedTheme;
  subscribe(listener: (theme: AppliedTheme) => void): () => void;
}

export function matchMediaSource(win: Pick<Window, "matchMedia"> = window): SystemThemeSource {
  const query = win.matchMedia?.("(prefers-color-scheme: dark)");
  return {
    current: () => (query?.matches ? "dark" : "light"),
    subscribe(listener) {
      if (!query) return () => {};
      const handler = (e: MediaQueryListEvent) => listener(e.matches ? "dark" : "light");
      query.addEventListener("change", handler);
      return () => query.removeEventListener("change", handler);
    },
  };
}

/** data-theme 를 받는 곳. 브라우저는 document.documentElement */
export interface ThemeTarget {
  dataset: DOMStringMap | Record<string, string | undefined>;
}

export class ThemeController {
  /** 지금 화면에 적용된 테마 */
  applied: AppliedTheme = "dark";
  private stop: (() => void) | null = null;

  constructor(
    private readonly settings: SettingsStore,
    private readonly target: ThemeTarget,
    private readonly source: SystemThemeSource,
  ) {
    makeObservable(this, { applied: observable, apply: action });
  }

  /** settings.theme 와 OS 테마를 듣기 시작한다. 돌려주는 함수로 멈춘다 */
  start(): () => void {
    this.stop?.();
    const unsubscribe = this.source.subscribe(() => this.refresh());
    const dispose = reaction(
      () => this.settings.settings.theme,
      () => this.refresh(),
      { fireImmediately: true },
    );
    this.stop = () => {
      unsubscribe();
      dispose();
      this.stop = null;
    };
    return this.stop;
  }

  refresh(): void {
    const pref = this.settings.settings.theme;
    this.apply(pref === "system" ? this.source.current() : pref);
  }

  apply(theme: AppliedTheme): void {
    this.applied = theme;
    this.target.dataset.theme = theme;
  }

  dispose(): void {
    this.stop?.();
  }
}
