// API 명세를 어디서 읽을지 (docs/plans/e1-scripting.md 마일스톤 4).
//   1. 열린 프로젝트의 resources/api/initial2d-api.json (백엔드로 읽는다)
//   2. 없으면 번들에 든 api-fallback.json (README 의 Lua 대응표에서 뽑은 최소 명세)
// 백엔드는 프로젝트 루트 밖을 읽지 못하므로 설정의 엔진 경로 옆(../resources/api)은 시도하지 않는다.
// 엔진 저장소를 프로젝트로 열면 1 이 그 파일을 찾는다.

import type { ProjectBackend } from "@initial-editor/core";
import fallbackJson from "./api-fallback.json";
import { parseApiSpec, type ApiSpec } from "./apiSpec";

export const API_SPEC_PATH = "resources/api/initial2d-api.json";

export type SpecSource = "project" | "fallback";

export interface LoadedSpec {
  spec: ApiSpec;
  source: SpecSource;
  /** 프로젝트 파일이 있었지만 읽거나 파싱하지 못한 이유 (있으면 경고로 찍는다) */
  problem?: string;
}

export function fallbackSpec(): ApiSpec {
  return parseApiSpec(fallbackJson);
}

export async function loadApiSpec(backend: ProjectBackend | null, projectOpen: boolean): Promise<LoadedSpec> {
  if (backend && projectOpen) {
    let exists = false;
    try {
      exists = await backend.exists(API_SPEC_PATH);
    } catch {
      exists = false;
    }
    if (exists) {
      try {
        const text = await backend.readText(API_SPEC_PATH);
        return { spec: parseApiSpec(text), source: "project" };
      } catch (e) {
        return { spec: fallbackSpec(), source: "fallback", problem: `${API_SPEC_PATH} 을(를) 읽지 못했다: ${(e as Error).message}` };
      }
    }
  }
  return { spec: fallbackSpec(), source: "fallback" };
}
