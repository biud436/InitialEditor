// 시작할 때 백엔드를 고른다 (docs/plans/03-project-and-runtime.md 2절).
//   Tauri 웹뷰 안이면 TauriBackend.
//   브라우저에서는 URL 질의로 고른다: ?backend=memory (샘플 프로젝트, 의존성 없음), 그 밖은 브리지.
//   브리지 URL 은 ?url= > 설정의 bridgeUrl > DEFAULT_BRIDGE_URL.
// yarn dev 는 VITE_DEFAULT_BACKEND=memory 가 있으면 메모리, 없으면 브리지로 연다.

import { MemoryBackend, type ProjectBackend, type SettingsStorage } from "@initial-editor/core";
import { BridgeBackend, DEFAULT_BRIDGE_URL } from "@initial-editor/backend-bridge";
import { isTauri, TauriBackend, TauriSettingsStorage } from "@initial-editor/backend-tauri";
import { LocalStorageSettingsStorage } from "./LocalStorageSettingsStorage";
import { SAMPLE_ROOT, sampleProjectFiles } from "./sampleProject";

export type BackendMode = "tauri" | "bridge" | "memory";

export const MODE_LABELS: Record<BackendMode, string> = {
  tauri: "Tauri",
  bridge: "브리지",
  memory: "메모리",
};

export interface StartupQuery {
  backend?: string;
  url?: string;
  /** 메모리 모드의 샘플 변형. "nogame" 이면 game.json 없이 시작한다 (등록 흐름 검사용) */
  sample?: string;
}

export function parseQuery(search: string): StartupQuery {
  const params = new URLSearchParams(search);
  return {
    backend: params.get("backend") ?? undefined,
    url: params.get("url") ?? undefined,
    sample: params.get("sample") ?? undefined,
  };
}

export function chooseMode(query: StartupQuery, env: { VITE_DEFAULT_BACKEND?: string } = {}, tauri = isTauri()): BackendMode {
  if (tauri) return "tauri";
  const wanted = query.backend ?? env.VITE_DEFAULT_BACKEND;
  return wanted === "memory" ? "memory" : "bridge";
}

export function createSettingsStorage(mode: BackendMode): SettingsStorage {
  return mode === "tauri" ? new TauriSettingsStorage() : new LocalStorageSettingsStorage();
}

export interface BackendSelection {
  backend: ProjectBackend;
  /** 시작하자마자 열 프로젝트 (브리지는 서버 URL). 없으면 시작 화면에서 고른다 */
  autoOpenRoot?: string;
  /** 브리지 모드에서 쓰는 URL (상태 표시) */
  bridgeUrl?: string;
}

export function resolveBridgeUrl(query: StartupQuery, settingsUrl: string | undefined): string {
  return (query.url || settingsUrl || DEFAULT_BRIDGE_URL).replace(/\/+$/, "");
}

export function createBackend(mode: BackendMode, query: StartupQuery, settingsUrl?: string): BackendSelection {
  switch (mode) {
    case "tauri":
      return { backend: new TauriBackend() };
    case "memory":
      return { backend: createMemoryBackend(query.sample) };
    case "bridge": {
      const url = resolveBridgeUrl(query, settingsUrl);
      return { backend: new BridgeBackend(url), autoOpenRoot: url, bridgeUrl: url };
    }
  }
}

export function createMemoryBackend(sample?: string): MemoryBackend {
  const files = sampleProjectFiles();
  if (sample === "nogame") delete files["game.json"];
  return new MemoryBackend(files);
}

export { SAMPLE_ROOT };
