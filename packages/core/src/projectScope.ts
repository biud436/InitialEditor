// 프로젝트 파일의 범위 (docs/plans/next-goals.md 1절). 프로젝트 뷰의 필터, 찾기, 게임 탭 스테이징, 자산 목록이 같은 규칙을 쓴다.
//   기본: 엔진이 읽는 game.json, scripts/, resources/. 점으로 시작하는 이름(.initial-editor, .git 포함)은 뺀다
//   무시 파일: 프로젝트 최상위의 .initial-editorignore (.gitignore 문법의 부분집합)가 더 뺀다. !로 다시 넣을 수 있고,
//   뺀 폴더 안은 다시 넣지 못한다 (git 과 같다)

import type { EntryKind } from "./backend";
import { normalizeRel } from "./paths";

export const PROJECT_ROOT_FILES: readonly string[] = ["game.json"];
export const PROJECT_ROOT_DIRS: readonly string[] = ["scripts", "resources"];
export const IGNORE_FILE = ".initial-editorignore";

interface IgnoreRule {
  negate: boolean;
  dirOnly: boolean;
  regex: RegExp;
  /** 슬래시가 없는 패턴은 어느 깊이의 이름에나 맞는다 */
  anyDepth: boolean;
}

/** .gitignore 문법의 글롭을 정규식으로: ** 는 폴더를 건너고, * 와 ? 는 한 이름 안, [..] 는 문자 집합 */
function globToRegex(glob: string): string {
  let out = "";
  for (let i = 0; i < glob.length; i++) {
    const c = glob[i];
    if (c === "*") {
      if (glob[i + 1] === "*") {
        const slash = glob[i + 2] === "/";
        out += slash ? "(?:.*/)?" : ".*";
        i += slash ? 2 : 1;
      } else out += "[^/]*";
    } else if (c === "?") out += "[^/]";
    else if (c === "[") {
      const end = glob.indexOf("]", i + 1);
      if (end < 0) out += "\\[";
      else {
        const body = glob.slice(i + 1, end).replace(/^!/, "^").replace(/\\/g, "\\\\");
        out += `[${body}]`;
        i = end;
      }
    } else if (c === "\\" && i + 1 < glob.length) {
      out += glob[i + 1].replace(/[.*+?^${}()|[\]\\/]/g, "\\$&");
      i++;
    } else out += c.replace(/[.*+?^${}()|[\]\\/]/g, "\\$&");
  }
  return out;
}

export class IgnoreRules {
  private constructor(private readonly rules: readonly IgnoreRule[]) {}

  static parse(text: string): IgnoreRules {
    const rules: IgnoreRule[] = [];
    for (const raw of text.split(/\r?\n/)) {
      let line = raw.replace(/(?<!\\)\s+$/, "");
      if (line === "" || line.startsWith("#")) continue;
      let negate = false;
      if (line.startsWith("!")) {
        negate = true;
        line = line.slice(1);
      } else if (line.startsWith("\\!") || line.startsWith("\\#")) line = line.slice(1);
      let dirOnly = false;
      if (line.endsWith("/")) {
        dirOnly = true;
        line = line.replace(/\/+$/, "");
      }
      if (line === "") continue;
      const anchored = line.includes("/");
      line = line.replace(/^\/+/, "");
      rules.push({ negate, dirOnly, anyDepth: !anchored, regex: new RegExp(`^${globToRegex(line)}$`) });
    }
    return new IgnoreRules(rules);
  }

  static empty(): IgnoreRules {
    return new IgnoreRules([]);
  }

  get size(): number {
    return this.rules.length;
  }

  /** 이 경로 자신이 규칙에 걸리는가 (조상 폴더는 보지 않는다). 마지막으로 맞은 규칙이 이긴다 */
  matches(rel: string, kind: EntryKind): boolean {
    const name = rel.slice(rel.lastIndexOf("/") + 1);
    let ignored = false;
    for (const r of this.rules) {
      if (r.dirOnly && kind !== "dir") continue;
      if (r.regex.test(r.anyDepth ? name : rel)) ignored = !r.negate;
    }
    return ignored;
  }

  /** 이 경로나 그 조상 폴더가 빠지는가 */
  ignores(path: string, kind: EntryKind): boolean {
    const rel = normalizeRel(path);
    if (rel === "" || this.rules.length === 0) return false;
    const parts = rel.split("/");
    for (let i = 1; i < parts.length; i++) {
      if (this.matches(parts.slice(0, i).join("/"), "dir")) return true;
    }
    return this.matches(rel, kind);
  }
}

/** 기본 범위(무시 파일 없이): game.json, scripts/, resources/ 와 그 안. 점으로 시작하는 이름은 뺀다 */
export function inProjectBase(path: string, kind: EntryKind): boolean {
  let rel: string;
  try {
    rel = normalizeRel(path);
  } catch {
    return false;
  }
  if (rel === "") return kind === "dir";
  const parts = rel.split("/");
  if (parts.some((p) => p.startsWith("."))) return false;
  if (parts.length === 1) return kind === "file" ? PROJECT_ROOT_FILES.includes(rel) : PROJECT_ROOT_DIRS.includes(rel);
  return PROJECT_ROOT_DIRS.includes(parts[0]);
}

/** 프로젝트 파일의 범위: 기본 범위에서 무시 파일이 뺀 것 */
export class ProjectScope {
  constructor(readonly ignore: IgnoreRules = IgnoreRules.empty()) {}

  includes(path: string, kind: EntryKind): boolean {
    if (!inProjectBase(path, kind)) return false;
    return !this.ignore.ignores(path, kind);
  }
}
