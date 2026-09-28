// 안드로이드 스테이징에 쓸 엔진 저장소 찾기 (docs/plans/e6-packaging.md 6.3). 순수 함수라 Node 로 테스트한다.
// 저장소는 android/prepare_assets.sh 가 있는 폴더다. 순서: 설정의 engineRepoPath > 열린 프로젝트 자신 > 실행기가 찾은 엔진이
// <저장소>/build/Initial2D 꼴이면 그 저장소 > 형제 폴더 ../Initial2D. 있는지는 셸이 실행하지 않고 본다 (android_repo_probe).
// 스크립트를 실행하는 일이라 엔진과 같은 신뢰 규칙을 따른다 (2.3 절): 설정 말고의 후보는 스크립트 경로를 보이고 한 번 묻고,
// 허용한 스크립트는 앱 설정(androidTrust)에 프로젝트별로 남는다. 다른 스크립트를 가리키게 되면 다시 묻는다.

import type { EngineTrustRecord, Platform } from "@initial-editor/core";

export type RepoSource = "settings" | "project" | "engine" | "sibling";

export interface RepoCandidate {
  source: RepoSource;
  /** 저장소 폴더의 절대 경로 (OS 구분자 그대로) */
  repo: string;
  /** <저장소>/android/prepare_assets.sh */
  script: string;
  /** 프로젝트에서 나온 후보라 스크립트 실행을 허용받아야 한다 (설정의 저장소와 설정의 엔진에서 나온 것만 false) */
  needsTrust: boolean;
}

export const REPO_SOURCE_LABELS: Record<RepoSource, string> = {
  settings: "설정의 엔진 저장소",
  project: "열린 프로젝트 자신",
  engine: "찾은 엔진의 저장소",
  sibling: "프로젝트 상위 폴더의 Initial2D",
};

export interface RepoCandidateInput {
  /** settings.engineRepoPath (비어 있으면 건너뛴다) */
  settingsPath: string;
  /** 프로젝트 루트의 절대 경로 */
  root: string;
  /** 실행기가 찾은 엔진 실행 파일. 없으면 null */
  enginePath: string | null;
  /** 그 엔진의 출처 (EngineSource). settings 면 사람이 고른 엔진이라 그 저장소도 신뢰한다 */
  engineSource: string;
  platform: Platform;
}

function trimTrailingSep(p: string): string {
  return p.length > 1 ? p.replace(/[\\/]+$/, "") : p;
}

function sepOf(p: string): string {
  return p.includes("\\") && !p.includes("/") ? "\\" : "/";
}

function join(base: string, ...parts: string[]): string {
  const sep = sepOf(base);
  const head = trimTrailingSep(base);
  return (head.endsWith(sep) ? head : head + sep) + parts.join(sep);
}

function parentDir(p: string): string {
  const trimmed = trimTrailingSep(p);
  const i = Math.max(trimmed.lastIndexOf("/"), trimmed.lastIndexOf("\\"));
  if (i < 0) return trimmed;
  if (i === 0) return trimmed[0];
  const parent = trimmed.slice(0, i);
  return /^[a-zA-Z]:$/.test(parent) ? parent + sepOf(p) : parent;
}

/** 저장소 안의 스테이징 스크립트 */
export function stageScriptPath(repo: string): string {
  return join(repo, "android", "prepare_assets.sh");
}

/** 스테이징 대상 (통째로 바뀐다) */
export function stageDestPath(repo: string): string {
  return join(repo, "android", "app", "src", "main", "assets") + sepOf(repo);
}

/** 엔진 실행 파일이 <저장소>/build/Initial2D(.exe) 꼴이면 그 저장소, 아니면 null */
export function repoFromEngine(exe: string | null): string | null {
  if (!exe) return null;
  const m = /^(.+?)[\\/]+build[\\/]+Initial2D(?:\.exe)?$/i.exec(exe.trim());
  if (!m) return null;
  return /^[a-zA-Z]:$/.test(m[1]) ? m[1] + sepOf(exe) : m[1];
}

/** 같은 폴더인가 (끝 구분자와, Windows 는 대소문자와 구분자를 가리지 않는다) */
function sameKey(p: string, platform: Platform): string {
  const t = trimTrailingSep(p);
  return platform === "win" ? t.replace(/\\/g, "/").toLowerCase() : t;
}

/** 후보 목록. 같은 폴더는 처음 것만 남긴다 */
export function repoCandidates(input: RepoCandidateInput): RepoCandidate[] {
  const out: RepoCandidate[] = [];
  const add = (source: RepoSource, repo: string, needsTrust: boolean) => {
    const clean = trimTrailingSep(repo.trim());
    if (clean === "") return;
    out.push({ source, repo: clean, script: stageScriptPath(clean), needsTrust });
  };
  add("settings", input.settingsPath, false);
  add("project", input.root, true);
  const fromEngine = repoFromEngine(input.enginePath);
  if (fromEngine) add("engine", fromEngine, input.engineSource !== "settings");
  const root = trimTrailingSep(input.root.trim());
  if (root !== "") add("sibling", join(parentDir(root), "Initial2D"), true);
  const seen = new Set<string>();
  return out.filter((c) => {
    const key = sameKey(c.repo, input.platform);
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

/** 이 후보의 스크립트를 실행해도 되는가. 허용 기록이 그 스크립트를 담고 있어야 한다 */
export function isRepoTrusted(candidate: RepoCandidate, record: EngineTrustRecord | undefined): boolean {
  return !candidate.needsTrust || (!!record && record.allow && record.exes.includes(candidate.script));
}

/** 스크립트 하나를 허용한 기록 (이미 허용한 것은 남긴다) */
export function withTrustedScript(record: EngineTrustRecord | undefined, script: string): EngineTrustRecord {
  const kept = record?.allow ? record.exes.filter((e) => e !== script) : [];
  return { allow: true, exes: [...kept, script] };
}
