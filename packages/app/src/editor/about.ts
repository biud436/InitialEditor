// 정보 창과 시작 화면이 보이는 판, 커밋, 링크 (docs/plans/e6-packaging.md 7.4). 그리기는 components/AboutDialog.tsx 와
// components/documents/WelcomeView.tsx 가 한다.

import type { BackendMode } from "./backends";
import { ENGINE_DIR, engineBaseUrl } from "./gameView/engineAssets";

/** vite.config.ts 의 define 이 채운다. 테스트처럼 define 이 없으면 "dev" */
export const APP_COMMIT: string = typeof __APP_COMMIT__ === "string" ? __APP_COMMIT__ : "dev";

/** 엔진 README 의 Lua 대응표 */
export const ENGINE_README_API = "https://github.com/biud436/Initial2D#lua-대응표";
/** 계획 문서 (통합 브랜치 next) */
export const PLANS_INDEX = "https://github.com/biud436/InitialEditor/blob/next/docs/plans/index.md";
/** 데스크톱 앱을 받는 곳 (GitHub 릴리스) */
export const RELEASES_URL = "https://github.com/biud436/InitialEditor/releases";
/** 웹판 (Cloudflare Pages 의 프로덕션 주소) */
export const WEB_EDITION_URL = "https://initial-editor.biud436.com/";
/** 에디터가 쓰는 라이브러리의 제3자 고지 (저장소의 src-tauri/licenses/) */
export const EDITOR_NOTICES_URL = "https://github.com/biud436/InitialEditor/tree/next/src-tauri/licenses";
/** 엔진(네이티브와 웹)의 제3자 고지. 웹 엔진과 함께 engine/ 에 실린다 */
export const ENGINE_NOTICES_FILE = "THIRD-PARTY.md";

export interface EditionLink {
  label: string;
  url: string;
}

/** 프로세스 실행에 쓸 엔진 한 줄. 정보 창과 설정 대화상자의 "찾은 엔진" 이 같이 쓴다 */
export function foundEngineText(runner: { engineDescription: string | null; resolving: boolean }, projectOpen: boolean): string {
  if (runner.engineDescription) return runner.engineDescription;
  if (!projectOpen) return "열린 프로젝트 없음 (프로젝트를 열면 탐색)";
  return runner.resolving ? "탐색 중" : "없음 (F5 는 게임 탭에서 실행)";
}

/** 데스크톱 앱은 웹판 열기, 웹판(브라우저)은 데스크톱 앱 받기 */
export function editionLink(mode: BackendMode): EditionLink {
  return mode === "tauri" ? { label: "브라우저 모드 열기", url: WEB_EDITION_URL } : { label: "데스크톱 앱 받기", url: RELEASES_URL };
}

/**
 * 웹판에서 안 되는 것 (데스크톱 앱에서 된다). features 는 웹 엔진 MANIFEST 의 기능이고, 모르면 null.
 * 웹 엔진에 mruby 가 없다고 알 때만 Ruby 실행을 더한다
 */
export function webLimits(features: readonly string[] | null): string[] {
  const out = ["엔진 프로세스 실행", "안드로이드 스테이징"];
  if (features && !features.includes("mruby")) out.push("Ruby 게임 실행");
  return out;
}

/** 새 프로젝트 대화상자의 Ruby 안내 (웹판에서 웹 엔진에 mruby 가 없을 때만) */
export const WEB_NO_RUBY = "브라우저 모드에서 실행 불가 (데스크톱 앱에서 실행)";

export function rubyNoteFor(mode: BackendMode, features: readonly string[] | null): string | null {
  if (mode === "tauri" || !features) return null;
  return features.includes("mruby") ? null : WEB_NO_RUBY;
}

/** 엔진 제3자 고지를 읽는다 (웹판과 데스크톱이 같은 곳: 앱이 놓인 곳의 engine/THIRD-PARTY.md) */
export async function loadEngineNotices(fetchFn: typeof fetch = fetch, base: string = engineBaseUrl()): Promise<string> {
  const url = new URL(ENGINE_NOTICES_FILE, base).href;
  const res = await fetchFn(url, { cache: "no-cache" });
  if (!res.ok) throw new Error(`${ENGINE_DIR}${ENGINE_NOTICES_FILE} 읽기 실패 (HTTP ${res.status})`);
  return res.text();
}
