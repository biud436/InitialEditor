// 게임 뷰의 파일 스테이징 (docs/plans/e4-embedded-play.md 마일스톤 1). 백엔드로 프로젝트 파일을 읽어 웹 엔진의
// 가상 파일 시스템(MEMFS 의 /project)에 올릴 목록을 만든다. DOM 을 모르고 백엔드만 본다 (Node 로 테스트한다).
//
// 올리는 것: game.json, scripts/ 아래 전부, resources/ 아래 전부.
// 빼는 것: resources/rtp/, resources/aldebaran/src/, .initial-editor/, .git/, 점으로 시작하는 이름, *.zip, *.psd,
// 그리고 32 MB 를 넘는 파일(경고를 남긴다).

import { isInside, normalizeRel, type Entry, type ProjectBackend } from "@initial-editor/core";

export const STAGE_ROOTS: readonly string[] = ["scripts", "resources"];
export const STAGE_ROOT_FILES: readonly string[] = ["game.json"];
export const STAGE_EXCLUDED_DIRS: readonly string[] = ["resources/rtp", "resources/aldebaran/src", ".initial-editor", ".git"];
export const STAGE_EXCLUDED_EXTENSIONS: readonly string[] = ["zip", "psd"];
export const MAX_STAGE_BYTES = 32 * 1024 * 1024;
export const STAGE_CONCURRENCY = 8;

function extensionOf(path: string): string {
  const base = path.slice(path.lastIndexOf("/") + 1);
  const dot = base.lastIndexOf(".");
  return dot <= 0 ? "" : base.slice(dot + 1).toLowerCase();
}

function hasHiddenSegment(path: string): boolean {
  return path.split("/").some((seg) => seg.startsWith("."));
}

/** 폴더를 내려가 볼 것인가 (빼는 폴더면 통째로 건너뛴다) */
export function isStageDir(path: string): boolean {
  let rel: string;
  try {
    rel = normalizeRel(path);
  } catch {
    return false;
  }
  if (rel === "") return true;
  if (hasHiddenSegment(rel)) return false;
  if (STAGE_EXCLUDED_DIRS.some((dir) => isInside(dir, rel))) return false;
  // 뿌리 폴더 자신이거나 그 안, 또는 뿌리 폴더로 가는 길 위
  return STAGE_ROOTS.some((root) => isInside(root, rel) || isInside(rel, root));
}

/** 이 파일을 올리는가 (크기는 따로 본다) */
export function isStagePath(path: string): boolean {
  let rel: string;
  try {
    rel = normalizeRel(path);
  } catch {
    return false;
  }
  if (rel === "") return false;
  if (STAGE_ROOT_FILES.includes(rel)) return true;
  if (hasHiddenSegment(rel)) return false;
  if (STAGE_EXCLUDED_EXTENSIONS.includes(extensionOf(rel))) return false;
  if (STAGE_EXCLUDED_DIRS.some((dir) => isInside(dir, rel))) return false;
  return STAGE_ROOTS.some((root) => rel !== root && isInside(root, rel));
}

export interface StageEntry {
  path: string;
  /** 목록이 알려 준 크기. 모르면 undefined */
  size?: number;
}

export interface StageListResult {
  files: StageEntry[];
  /** 크기 한도를 넘어 뺀 파일 */
  tooLarge: StageEntry[];
}

/**
 * 올릴 파일 목록. roots 를 주면 그 폴더들만 본다 (핫 리로드가 scripts 와 씬과 맵만 다시 올릴 때).
 * 없는 폴더는 조용히 건너뛴다.
 */
export async function listStageFiles(backend: ProjectBackend, roots?: readonly string[]): Promise<StageListResult> {
  const files: StageEntry[] = [];
  const tooLarge: StageEntry[] = [];
  const take = (e: Entry) => {
    if (!isStagePath(e.path)) return;
    const entry: StageEntry = { path: normalizeRel(e.path), size: e.size };
    if (e.size !== undefined && e.size > MAX_STAGE_BYTES) tooLarge.push(entry);
    else files.push(entry);
  };
  const walk = async (dir: string): Promise<void> => {
    let entries: Entry[];
    try {
      entries = await backend.list(dir);
    } catch {
      return; // 없는 폴더
    }
    const subdirs: string[] = [];
    for (const e of entries) {
      if (e.kind === "dir") {
        if (isStageDir(e.path)) subdirs.push(e.path);
      } else take(e);
    }
    await Promise.all(subdirs.map((d) => walk(d)));
  };
  if (roots) {
    await Promise.all(roots.map((r) => walk(r)));
  } else {
    for (const name of STAGE_ROOT_FILES) {
      if (await backend.exists(name).catch(() => false)) take({ name, path: name, kind: "file" });
    }
    await Promise.all(STAGE_ROOTS.map((r) => walk(r)));
  }
  files.sort((a, b) => (a.path < b.path ? -1 : a.path > b.path ? 1 : 0));
  return { files, tooLarge };
}

export interface ReadStageOptions {
  concurrency?: number;
  /** 파일 하나를 읽을 때마다 (done, total) */
  onProgress?: (done: number, total: number) => void;
  /** 멈추라는 신호. 켜지면 남은 파일을 읽지 않고 AbortError 를 던진다 */
  signal?: AbortSignal;
}

export interface ReadStageResult {
  files: Record<string, Uint8Array>;
  bytes: number;
  /** 읽고 보니 한도를 넘은 파일 (목록에 크기가 없던 것) */
  tooLarge: string[];
}

export class StageAbortedError extends Error {
  constructor() {
    super("시작 취소됨");
    this.name = "AbortError";
  }
}

/** 파일을 동시에 concurrency 개까지 읽는다. 하나라도 못 읽으면 경로를 붙여 던진다 */
export async function readStageFiles(backend: ProjectBackend, entries: readonly StageEntry[], opts: ReadStageOptions = {}): Promise<ReadStageResult> {
  const limit = Math.max(1, opts.concurrency ?? STAGE_CONCURRENCY);
  const files: Record<string, Uint8Array> = {};
  const tooLarge: string[] = [];
  let bytes = 0;
  let done = 0;
  let next = 0;
  opts.onProgress?.(0, entries.length);
  const worker = async () => {
    while (next < entries.length) {
      if (opts.signal?.aborted) throw new StageAbortedError();
      const entry = entries[next++];
      let data: Uint8Array;
      try {
        data = await backend.readBinary(entry.path);
      } catch (e) {
        throw new Error(`${entry.path} 읽기 실패: ${(e as Error).message}`);
      }
      if (data.byteLength > MAX_STAGE_BYTES) tooLarge.push(entry.path);
      else {
        files[entry.path] = data;
        bytes += data.byteLength;
      }
      done++;
      opts.onProgress?.(done, entries.length);
    }
  };
  await Promise.all(Array.from({ length: Math.min(limit, entries.length) }, () => worker()));
  if (opts.signal?.aborted) throw new StageAbortedError();
  return { files, bytes, tooLarge };
}

/** 1536 → "1.5 KB", 6_000_000 → "5.7 MB" */
export function formatBytes(n: number): string {
  if (n < 1024) return `${n} B`;
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(1)} KB`;
  return `${(n / (1024 * 1024)).toFixed(1)} MB`;
}
