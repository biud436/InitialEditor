// 프로젝트 전체 찾기 (docs/plans/e1-scripting.md 마일스톤 5). scripts/ 와 resources/ 아래의 텍스트 파일을 백엔드로
// 읽어 줄 단위로 맞춘다. 맞추기(matchLines)는 순수 함수라 Node 로 테스트하고, FindStore 는 결과와 진행 상태를
// 들고 FindPanel 이 그린다. 파일은 몇 개마다 이벤트 루프에 양보해 UI 가 굳지 않게 한다.

import { extname, sortEntries, type Entry, type ProjectBackend } from "@initial-editor/core";
import { action, makeObservable, observable, runInAction } from "mobx";

export interface FindOptions {
  caseSensitive: boolean;
  regex: boolean;
}

export interface FindMatch {
  /** 1부터 */
  line: number;
  /** 1부터 */
  column: number;
  length: number;
  /** 그 줄 전체 (패널이 앞뒤 문맥을 보인다) */
  text: string;
}

export interface FileMatches {
  path: string;
  matches: FindMatch[];
}

export const SEARCH_ROOTS = ["scripts", "resources"];
export const MAX_FILE_BYTES = 2 * 1024 * 1024;
/** 확장자로 거르는 바이너리. 이름에 확장자가 없으면 읽어 보고 NUL 이 있으면 건너뛴다 */
export const BINARY_EXTENSIONS = new Set([
  "png", "jpg", "jpeg", "gif", "bmp", "webp", "ico", "tga", "psd",
  "wav", "mp3", "ogg", "flac", "mid", "midi",
  "ttf", "otf", "woff", "woff2",
  "zip", "gz", "7z", "rar", "tar",
  "exe", "dll", "so", "dylib", "bin", "dat", "pdf",
]);
const YIELD_EVERY = 8;
const MAX_MATCHES_PER_FILE = 500;

export function escapeRegExp(text: string): string {
  return text.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

/** 질의를 정규식으로. regex 가 아니면 글자 그대로. 잘못된 정규식은 던진다 */
export function compileQuery(query: string, options: FindOptions): RegExp {
  const source = options.regex ? query : escapeRegExp(query);
  return new RegExp(source, options.caseSensitive ? "g" : "gi");
}

/** 텍스트를 줄로 나눠 맞는 자리를 전부 찾는다. 빈 매치(예: `a*`)는 한 칸 나아가 무한 루프를 막는다 */
export function matchLines(text: string, query: RegExp, limit = MAX_MATCHES_PER_FILE): FindMatch[] {
  const out: FindMatch[] = [];
  const lines = text.split(/\r?\n/);
  const re = new RegExp(query.source, query.flags.includes("g") ? query.flags : query.flags + "g");
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    re.lastIndex = 0;
    let m: RegExpExecArray | null;
    while ((m = re.exec(line)) !== null) {
      if (m[0].length === 0) {
        re.lastIndex++;
        continue;
      }
      out.push({ line: i + 1, column: m.index + 1, length: m[0].length, text: line });
      if (out.length >= limit) return out;
    }
  }
  return out;
}

export function isSearchableEntry(entry: Entry): boolean {
  if (entry.kind !== "file") return false;
  if (entry.size !== undefined && entry.size > MAX_FILE_BYTES) return false;
  return !BINARY_EXTENSIONS.has(extname(entry.path));
}

export function looksBinary(text: string): boolean {
  return text.slice(0, 8000).includes("\0");
}

export interface FindDeps {
  backend(): ProjectBackend;
  isOpen(): boolean;
}

export class FindStore {
  query = "";
  caseSensitive = false;
  regex = false;
  results: FileMatches[] = [];
  running = false;
  error: string | null = null;
  /** 읽은 파일 수 (진행 표시) */
  scanned = 0;
  /** 마지막 검색의 질의 (결과 머리에 보인다) */
  lastQuery = "";
  /** 패널이 입력 칸에 초점을 주라는 신호 (커맨드가 올린다) */
  focusRequest = 0;
  private run = 0;

  constructor(private readonly deps: FindDeps) {
    makeObservable<FindStore, "run">(this, {
      query: observable,
      caseSensitive: observable,
      regex: observable,
      results: observable.shallow,
      running: observable,
      error: observable,
      scanned: observable,
      lastQuery: observable,
      focusRequest: observable,
      run: false,
      setQuery: action,
      setCaseSensitive: action,
      setRegex: action,
      requestFocus: action,
      clear: action,
    });
  }

  get matchCount(): number {
    let n = 0;
    for (const f of this.results) n += f.matches.length;
    return n;
  }

  setQuery(query: string): void {
    this.query = query;
  }

  setCaseSensitive(value: boolean): void {
    this.caseSensitive = value;
  }

  setRegex(value: boolean): void {
    this.regex = value;
  }

  requestFocus(query?: string): void {
    if (query !== undefined && query !== "") this.query = query;
    this.focusRequest++;
  }

  clear(): void {
    this.run++;
    this.results = [];
    this.error = null;
    this.running = false;
    this.scanned = 0;
    this.lastQuery = "";
  }

  cancel(): void {
    this.run++;
    runInAction(() => (this.running = false));
  }

  /** 검색을 시작한다. 이미 도는 것은 취소한다. 결과는 파일마다 바로 붙는다 */
  async search(): Promise<void> {
    const query = this.query;
    const id = ++this.run;
    let re: RegExp;
    try {
      re = compileQuery(query, { caseSensitive: this.caseSensitive, regex: this.regex });
    } catch (e) {
      runInAction(() => {
        this.error = `잘못된 정규식: ${(e as Error).message}`;
        this.results = [];
      });
      return;
    }
    runInAction(() => {
      this.results = [];
      this.error = null;
      this.scanned = 0;
      this.lastQuery = query;
      this.running = query !== "" && this.deps.isOpen();
    });
    if (query === "" || !this.deps.isOpen()) return;
    const backend = this.deps.backend();
    const alive = () => this.run === id;
    try {
      let sinceYield = 0;
      for await (const entry of walk(backend, SEARCH_ROOTS, alive)) {
        if (!alive()) return;
        if (!isSearchableEntry(entry)) continue;
        let text: string;
        try {
          text = await backend.readText(entry.path);
        } catch {
          continue;
        }
        if (!alive()) return;
        runInAction(() => this.scanned++);
        if (looksBinary(text)) continue;
        const matches = matchLines(text, re);
        if (matches.length) runInAction(() => (this.results = [...this.results, { path: entry.path, matches }]));
        if (++sinceYield >= YIELD_EVERY) {
          sinceYield = 0;
          await new Promise<void>((r) => setTimeout(r, 0));
        }
      }
    } catch (e) {
      if (alive()) runInAction(() => (this.error = `검색 실패: ${(e as Error).message}`));
    } finally {
      if (alive()) runInAction(() => (this.running = false));
    }
  }
}

/** 루트들 아래를 깊이 우선으로 돈다. 순서는 프로젝트 패널과 같다 (sortEntries: 폴더 먼저, 이름순). 없는 루트는 건너뛴다 */
async function* walk(backend: ProjectBackend, roots: string[], alive: () => boolean): AsyncGenerator<Entry> {
  for (const root of roots) {
    if (!alive()) return;
    if (await backend.exists(root).catch(() => false)) yield* walkDir(backend, root, alive);
  }
}

async function* walkDir(backend: ProjectBackend, dir: string, alive: () => boolean): AsyncGenerator<Entry> {
  let entries: Entry[];
  try {
    entries = sortEntries(await backend.list(dir));
  } catch {
    return;
  }
  for (const entry of entries) {
    if (!alive()) return;
    if (entry.kind === "dir") yield* walkDir(backend, entry.path, alive);
    else yield entry;
  }
}
