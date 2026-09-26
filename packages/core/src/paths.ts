// 프로젝트 루트 기준 상대 경로 규칙 (docs/plans/03-project-and-runtime.md 2절).
// 구분자는 `/`, 루트는 "" 이고, `..` 로 루트 밖을 가리키면 오류다.
// Windows 의 역슬래시는 여기서 `/` 로 바꾼다. 백엔드는 이 함수를 거친 경로만 받는다고 믿지 말고
// 스스로 다시 검사한다 (루트 밖 거부는 두 겹이다).

export class PathError extends Error {
  constructor(message: string, public readonly input: string) {
    super(message);
    this.name = "PathError";
  }
}

/**
 * 상대 경로를 정규화한다. "./a//b/../c\\d" → "a/c/d". 루트는 "".
 * 절대 경로(`/x`, `C:\x`)와 루트 밖(`../x`)은 PathError.
 */
export function normalizeRel(input: string): string {
  const raw = input.replace(/\\/g, "/");
  // 절대 경로는 실수로 넘어온 것이다 (대화상자가 준 OS 경로 등). 루트 기준으로 조용히 바꾸면
  // /Users/u/x 가 프로젝트 안의 Users/u/x 가 되어 버린다. "/" 하나만 루트로 본다.
  if (/^[a-zA-Z]:/.test(raw) || (raw.startsWith("/") && raw !== "/")) {
    throw new PathError(`절대 경로는 쓸 수 없다: ${input}`, input);
  }
  const parts: string[] = [];
  for (const seg of raw.split("/")) {
    if (seg === "" || seg === ".") continue;
    if (seg === "..") {
      if (parts.length === 0) throw new PathError(`프로젝트 루트 밖이다: ${input}`, input);
      parts.pop();
      continue;
    }
    parts.push(seg);
  }
  return parts.join("/");
}

export function joinRel(...parts: string[]): string {
  return normalizeRel(parts.filter((p) => p !== "").join("/"));
}

export function basename(rel: string): string {
  const n = normalizeRel(rel);
  const i = n.lastIndexOf("/");
  return i < 0 ? n : n.slice(i + 1);
}

export function dirname(rel: string): string {
  const n = normalizeRel(rel);
  const i = n.lastIndexOf("/");
  return i < 0 ? "" : n.slice(0, i);
}

/** 확장자 (점 없이, 소문자). 없으면 "" */
export function extname(rel: string): string {
  const base = basename(rel);
  const i = base.lastIndexOf(".");
  return i <= 0 ? "" : base.slice(i + 1).toLowerCase();
}

/** `child` 가 `parent` 안(또는 같음)인가. 둘 다 정규화된 상대 경로 */
export function isInside(parent: string, child: string): boolean {
  const p = normalizeRel(parent);
  const c = normalizeRel(child);
  if (p === "") return true;
  return c === p || c.startsWith(p + "/");
}

/** 표시용 이름. 루트는 "/" */
export function displayRel(rel: string): string {
  const n = normalizeRel(rel);
  return n === "" ? "/" : n;
}
