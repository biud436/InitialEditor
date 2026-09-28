// 바깥 링크 열기 (docs/plans/e6-packaging.md 7.4). 데스크톱 앱은 tauri-plugin-opener 의 open_url 로 기본 브라우저에서,
// 브라우저는 새 탭(window.open)으로 연다. Tauri 웹뷰는 <a target="_blank"> 를 무시하므로 모든 바깥 링크가 여기를 거친다.
// 여는 주소는 http 와 https 만이고, 데스크톱에서 열 수 있는 주소는 셸의 권한(capabilities 의 opener:allow-open-url)이 한 번 더 좁힌다.

import { invoke } from "@tauri-apps/api/core";
import { isTauri } from "@initial-editor/backend-tauri";

/** tauri-plugin-opener 의 명령 (JS 패키지 @tauri-apps/plugin-opener 의 openUrl 이 부르는 것과 같다) */
export const OPEN_URL_COMMAND = "plugin:opener|open_url";

export interface OpenExternalDeps {
  tauri: () => boolean;
  invoke: (command: string, args: Record<string, unknown>) => Promise<unknown>;
  open: (url: string, target: string, features: string) => unknown;
}

export const defaultOpenDeps: OpenExternalDeps = {
  tauri: isTauri,
  invoke: (command, args) => invoke(command, args),
  open: (url, target, features) => window.open(url, target, features),
};

/** 열 수 있는 주소면 정규화한 것, 아니면 던진다 (http, https 만) */
export function externalUrl(url: string): string {
  let parsed: URL;
  try {
    parsed = new URL(url.trim());
  } catch {
    throw new Error(`URL 형식 아님: ${url}`);
  }
  if (parsed.protocol !== "http:" && parsed.protocol !== "https:") throw new Error(`http 나 https URL 만 열기 가능: ${url}`);
  return parsed.href;
}

/** 바깥 링크를 연다. 데스크톱은 기본 브라우저, 브라우저는 새 탭. 열지 못하면 던진다 */
export async function openExternal(url: string, deps: OpenExternalDeps = defaultOpenDeps): Promise<void> {
  const href = externalUrl(url);
  if (deps.tauri()) {
    await deps.invoke(OPEN_URL_COMMAND, { url: href });
    return;
  }
  deps.open(href, "_blank", "noopener,noreferrer");
}

export interface OpenLinkHost {
  log: { warn(source: string, text: string): void };
  toasts: { warn(text: string): unknown };
}

/** 메뉴와 링크가 부르는 것: 열지 못하면 콘솔에 한 줄 남기고 토스트로 알린다 */
export async function openLink(host: OpenLinkHost, url: string, deps: OpenExternalDeps = defaultOpenDeps): Promise<boolean> {
  try {
    await openExternal(url, deps);
    return true;
  } catch (e) {
    const message = `링크 열기 실패: ${url} (${e instanceof Error ? e.message : String(e)})`;
    host.log.warn("editor", message);
    host.toasts.warn(message);
    return false;
  }
}
