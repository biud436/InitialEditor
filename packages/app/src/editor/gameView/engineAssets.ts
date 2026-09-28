// 웹 엔진 파일(public/engine/, scripts/sync-engine-web.mjs 가 엔진 저장소에서 복사한다)의 위치와 타입.
// 로더(initial2d-loader.js)는 번들러를 거치지 않는 ES 모듈이라 실행할 때 URL 로 import 한다.
// 계약은 엔진 저장소 docs/plans/r3-emscripten.md 5절이다.

import { errorText } from "./errorText";

export type StageData = Uint8Array | ArrayBuffer | string;

export interface EngineModule {
  FS: { readFile(path: string): Uint8Array; writeFile(path: string, data: Uint8Array | string): void };
  /** SDL2 포트의 오디오 상태 (Web Audio) */
  SDL2?: { audioContext?: AudioContext };
  /** Emscripten 의 C++ 예외 메시지 도우미 ([타입, 메시지]). 빌드가 내보낼 때만 있다 */
  getExceptionMessage?: (e: unknown) => [string, string] | unknown;
  [key: string]: unknown;
}

export interface BootOptions {
  canvas: HTMLCanvasElement;
  files?: Record<string, StageData>;
  env?: Record<string, string | number | boolean | null | undefined>;
  print?: (line: string) => void;
  printErr?: (line: string) => void;
  wasmUrl?: string;
  jsUrl?: string;
  cwd?: string;
  moduleOverrides?: Record<string, unknown>;
  /** 엔진의 메인 루프가 멈출 때 한 번 (0: quit 이나 정상 종료, 1: 치명적 오류). 이것을 모르는 로더는 무시한다 */
  onExit?: (code: number) => void;
}

/**
 * bootInitial2D 가 돌려주는 핸들. frames 와 errorText 는 엔진 저장소 로더 계약(onExit, frames, errorText)을
 * 따르는 빌드에만 있고, 그 빌드의 reload 는 스크립트가 깨끗이 다시 떴는지를 true 나 false 로 돌려준다.
 * 계약을 따르지 않는 빌드의 reload 는 아무것도 돌려주지 않는다. 쓰는 쪽은 있는지 보고 쓴다.
 */
export interface EngineGame {
  module: EngineModule;
  exitCode: number;
  stage(files: Record<string, StageData>): void;
  reload(files?: Record<string, StageData>, envPatch?: Record<string, string>): boolean | void;
  quit(): void;
  features(): string;
  /** 지금까지 돈 엔진 프레임 수 */
  frames?: () => number;
  /** wasm 밖으로 나온 것을 읽는 글로 (undefined 를 돌려주지 않는다) */
  errorText?: (e: unknown) => string;
}

export type BootEngine = (options: BootOptions) => Promise<EngineGame>;

export interface EngineManifest {
  engineCommit: string | null;
  /** 엔진 체크아웃에서 만들었는지(checkout), 엔진 릴리스에서 받았는지(release) */
  source?: "checkout" | "release";
  /** 이 사본을 다시 만드는 명령 */
  syncCommand?: string;
  engineDirty?: boolean | null;
  builtAt?: string;
  syncedAt?: string;
  features: string[];
  files: Array<{ path: string; size: number; sha256: string }>;
}

/** 웹 엔진이 도는 데 필요한 것: 부팅 함수와 기능 목록 */
export interface EngineRuntime {
  boot: BootEngine;
  manifest: EngineManifest;
}

export const ENGINE_DIR = "engine/";
export const ENGINE_MISSING = "웹 엔진 파일이 없습니다 (engine/MANIFEST.json). 엔진 저장소에서 tools/build_web.sh를 실행한 후 yarn sync:engine-web을 실행하세요.";

/** 앱이 놓인 곳 기준 engine/ 의 절대 URL */
export function engineBaseUrl(): string {
  return new URL(ENGINE_DIR, new URL(import.meta.env.BASE_URL || "/", document.baseURI)).href;
}

/** MANIFEST.json 을 읽고 로더를 import 한다. 한 번 읽은 것은 다시 쓴다 */
export function createEngineRuntimeLoader(baseUrl: () => string = engineBaseUrl): () => Promise<EngineRuntime> {
  let pending: Promise<EngineRuntime> | null = null;
  return () => {
    if (!pending) {
      pending = loadRuntime(baseUrl()).catch((e) => {
        pending = null; // 다음 시도에서 다시 읽는다 (그사이 sync 했을 수 있다)
        throw e;
      });
    }
    return pending;
  };
}

async function loadRuntime(base: string): Promise<EngineRuntime> {
  let manifest: EngineManifest;
  try {
    const res = await fetch(new URL("MANIFEST.json", base).href, { cache: "no-cache" });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    manifest = (await res.json()) as EngineManifest;
  } catch (e) {
    throw new Error(`${ENGINE_MISSING}: ${errorText(e)}`);
  }
  if (!Array.isArray(manifest.features)) manifest.features = ["lua", "wasm"];
  const loaderUrl = new URL("initial2d-loader.js", base).href;
  const mod = (await import(/* @vite-ignore */ loaderUrl)) as { bootInitial2D?: BootEngine };
  if (typeof mod.bootInitial2D !== "function") throw new Error(`로더에 bootInitial2D 없음: ${loaderUrl}`);
  const boot = mod.bootInitial2D;
  const wasmUrl = new URL("Initial2D.wasm", base).href;
  const jsUrl = new URL("Initial2D.js", base).href;
  return { manifest, boot: (options) => boot({ wasmUrl, jsUrl, ...options }) };
}

/** 커밋 앞 일곱 자리 (없으면 "?") */
export function shortCommit(manifest: EngineManifest | null): string {
  return manifest?.engineCommit ? manifest.engineCommit.slice(0, 7) : "?";
}
