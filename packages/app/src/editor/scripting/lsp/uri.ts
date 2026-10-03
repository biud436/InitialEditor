// 프로젝트 경로와 LSP 의 file URI 사이 (docs/plans/language-server.md 4.2절).
// 에디터의 Monaco 모델은 initial:/<프로젝트 상대 경로> 이고, 언어 서버는 디스크의 절대 경로를 file URI 로 본다.
// URI 는 경로 조각마다 percent 인코딩하고, Windows 경로는 file:///C:/... 꼴이다. 서버가 드라이브 문자를 소문자로 하거나
// 콜론을 %3A 로 보내도 같은 경로로 읽는다.

const DRIVE = /^[A-Za-z]:/;

/** 역슬래시를 슬래시로, 끝의 슬래시를 뗀다 (드라이브 뿌리 C:/ 와 / 는 남긴다) */
export function normalizePath(path: string): string {
  let p = path.replace(/\\/g, "/");
  while (p.length > 1 && p.endsWith("/") && !/^[A-Za-z]:\/$/.test(p)) p = p.slice(0, -1);
  return p;
}

/** 절대 경로를 file URI 로 */
export function fileUri(absPath: string): string {
  const p = normalizePath(absPath);
  const segments = p.split("/").map((s, i) => (i <= 1 && DRIVE.test(s) && s.length === 2 ? s : encodeURIComponent(s)));
  const joined = segments.join("/");
  return DRIVE.test(p) ? `file:///${joined}` : `file://${joined}`;
}

/** file URI 를 절대 경로로. file URI 가 아니면 null */
export function filePath(uri: string): string | null {
  if (!uri.toLowerCase().startsWith("file://")) return null;
  let rest = uri.slice("file://".length);
  // file://host/path 는 받지 않는다 (서버가 보내지 않는다)
  if (!rest.startsWith("/")) return null;
  let decoded: string;
  try {
    decoded = decodeURIComponent(rest);
  } catch {
    return null;
  }
  rest = decoded;
  if (/^\/[A-Za-z]:/.test(rest)) rest = rest.slice(1);
  return normalizePath(rest);
}

/** 루트 안이면 슬래시로 이은 상대 경로, 밖이면 null. Windows 경로는 대소문자를 가리지 않는다 */
export function relativeTo(root: string, absPath: string): string | null {
  const r = normalizePath(root);
  const p = normalizePath(absPath);
  const fold = DRIVE.test(r) ? (s: string) => s.toLowerCase() : (s: string) => s;
  if (fold(p) === fold(r)) return "";
  const prefix = r.endsWith("/") ? r : r + "/";
  if (!fold(p).startsWith(fold(prefix))) return null;
  return p.slice(prefix.length);
}

/** 루트와 상대 경로를 잇는다 */
export function joinPath(root: string, rel: string): string {
  const r = normalizePath(root);
  return rel ? `${r.endsWith("/") ? r : r + "/"}${rel}` : r;
}
