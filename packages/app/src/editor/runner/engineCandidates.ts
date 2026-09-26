// 엔진 실행 파일 후보 (docs/plans/03-project-and-runtime.md 4절). 순수 함수라 Node 로 테스트한다.
// 순서: 설정의 엔진 경로 > 프로젝트의 .initial-editor/engine (사람이 적은 한 줄) > 프로젝트 자체가 엔진 저장소인 경우의
// build/Initial2D > 형제 폴더 ../Initial2D/build/Initial2D. 각 후보는 RunnerStore 가 `exe --features` 로 찔러 보고 처음
// 응답하는 것을 쓴다. macOS .app 번들은 엔진이 그렇게 포장되지 않아(CMake 에 MACOSX_BUNDLE 없음) 다루지 않는다.

import type { Platform } from "@initial-editor/core";

export const ENGINE_FILE = ".initial-editor/engine";

export type EngineSource = "settings" | "project-file" | "project-build" | "sibling" | "none";

export interface EngineCandidate {
  source: EngineSource;
  /** 실행 파일의 절대 경로 (OS 구분자 그대로) */
  path: string;
}

export const ENGINE_SOURCE_LABELS: Record<EngineSource, string> = {
  settings: "설정의 엔진 경로",
  "project-file": ENGINE_FILE,
  "project-build": "프로젝트의 build/",
  sibling: "형제 폴더 ../Initial2D/build/",
  none: "없음",
};

export interface EngineCandidateInput {
  /** 프로젝트 루트의 절대 경로 */
  root: string;
  /** settings.enginePath (비어 있으면 건너뛴다) */
  settingsPath: string;
  /** .initial-editor/engine 의 내용. 없으면 null */
  projectFile: string | null;
  platform: Platform;
}

function isAbsolute(p: string): boolean {
  return /^(?:[a-zA-Z]:[\\/]|[\\/])/.test(p);
}

function trimTrailingSep(p: string): string {
  return p.length > 1 ? p.replace(/[\\/]+$/, "") : p;
}

function parentDir(root: string, sep: string): string {
  const trimmed = trimTrailingSep(root);
  const i = Math.max(trimmed.lastIndexOf("/"), trimmed.lastIndexOf("\\"));
  if (i < 0) return trimmed;
  if (i === 0) return sep; // "/proj" 의 부모는 "/"
  const parent = trimmed.slice(0, i);
  return /^[a-zA-Z]:$/.test(parent) ? parent + sep : parent; // "C:\proj" 의 부모는 "C:\"
}

function join(base: string, sep: string, ...parts: string[]): string {
  const head = trimTrailingSep(base);
  return (head.endsWith(sep) ? head : head + sep) + parts.join(sep);
}

/** 후보 목록. 같은 경로는 처음 것만 남긴다 */
export function engineCandidates(input: EngineCandidateInput): EngineCandidate[] {
  const sep = input.root.includes("\\") && !input.root.includes("/") ? "\\" : "/";
  const exe = input.platform === "win" ? "Initial2D.exe" : "Initial2D";
  const root = trimTrailingSep(input.root);
  const out: EngineCandidate[] = [];

  const fromSettings = input.settingsPath.trim();
  if (fromSettings !== "") out.push({ source: "settings", path: fromSettings });

  const fromFile = (input.projectFile ?? "")
    .split(/\r?\n/)
    .map((l) => l.trim())
    .find((l) => l !== "" && !l.startsWith("#"));
  if (fromFile) out.push({ source: "project-file", path: isAbsolute(fromFile) ? fromFile : join(root, sep, ...fromFile.split(/[\\/]/)) });

  out.push({ source: "project-build", path: join(root, sep, "build", exe) });
  out.push({ source: "sibling", path: join(parentDir(root, sep), sep, "Initial2D", "build", exe) });

  const seen = new Set<string>();
  return out.filter((c) => {
    if (seen.has(c.path)) return false;
    seen.add(c.path);
    return true;
  });
}
