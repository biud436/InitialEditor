// 이름 규칙: 그래프 파일 경로와 컴포넌트 논리 이름, 생성 파일 경로, 두 언어의 식별자.

export const IDENTIFIER = /^[A-Za-z_][A-Za-z0-9_]*$/;

/** 컴포넌트 경로 조각. 엔진 Ruby 로더가 조각마다 CamelCase 클래스 이름을 만든다 */
const PATH_SEGMENT = /^[a-z][a-z0-9_]*$/;

const GRAPH_SUFFIX = ".graph.json";
const LIBRARY_SUFFIX = ".nodes.json";

export function isGraphPath(path: string): boolean {
  return path.startsWith("scripts/components/") && path.endsWith(GRAPH_SUFFIX);
}

export function isLibraryPath(path: string): boolean {
  return path.startsWith("scripts/") && path.endsWith(LIBRARY_SUFFIX);
}

/** scripts/components/flappy/bird.graph.json → components/flappy/bird. 그래프 파일 경로가 아니면 null */
export function componentNameOfGraph(path: string): string | null {
  if (!isGraphPath(path)) return null;
  const name = path.slice("scripts/".length, -GRAPH_SUFFIX.length);
  const parts = name.split("/");
  if (parts.length < 2 || !parts.every((p) => PATH_SEGMENT.test(p))) return null;
  return name;
}

export function graphPathOfComponent(logicalName: string): string {
  return `scripts/${logicalName}${GRAPH_SUFFIX}`;
}

export interface GeneratedPaths {
  lua: string;
  ruby: string;
  /** 매개변수 선언 파일 (엔진 r1 5.4절) */
  declaration: string;
}

export function generatedPaths(logicalName: string): GeneratedPaths {
  return {
    lua: `scripts/lua/${logicalName}.lua`,
    ruby: `scripts/ruby/${logicalName}.rb`,
    declaration: `scripts/${logicalName}.json`,
  };
}

/** 엔진 Ruby 로더의 camel: "pipe_spawner" → "PipeSpawner" */
export function camel(name: string): string {
  return name
    .split("_")
    .map((s) => (s === "" ? "" : s[0].toUpperCase() + s.slice(1)))
    .join("");
}

/** components/flappy/bird → ["Components", "Flappy", "Bird"] (엔진 로더가 먼저 찾는 모듈 경로) */
export function rubyClassPath(logicalName: string): string[] {
  return logicalName.split("/").map(camel);
}

/** Ruby 쪽 이름: 대문자와 _ 만이면 소문자로 (GROUND_Y → ground_y), 아니면 camelCase 를 snake_case 로 (birdVy → bird_vy) */
export function snakeCase(name: string): string {
  if (/^[A-Z0-9_]+$/.test(name)) return name.toLowerCase();
  return name
    .replace(/([a-z0-9])([A-Z])/g, "$1_$2")
    .replace(/([A-Z]+)([A-Z][a-z])/g, "$1_$2")
    .toLowerCase();
}

export const LUA_KEYWORDS = new Set([
  "and", "break", "do", "else", "elseif", "end", "false", "for", "function", "goto", "if", "in",
  "local", "nil", "not", "or", "repeat", "return", "then", "true", "until", "while",
]);

export const RUBY_KEYWORDS = new Set([
  "BEGIN", "END", "__ENCODING__", "__FILE__", "__LINE__", "alias", "and", "begin", "break", "case",
  "class", "def", "defined?", "do", "else", "elsif", "end", "ensure", "false", "for", "if", "in",
  "module", "next", "nil", "not", "or", "redo", "rescue", "retry", "return", "self", "super", "then",
  "true", "undef", "unless", "until", "when", "while", "yield",
]);

/** 생성 코드가 쓰는 이름. 지역 변수와 라이브러리 별칭으로 쓸 수 없다 */
export const GENERATED_NAMES = new Set(["M", "obj", "scene", "elapsed", "params", "st", "math", "require", "print", "puts", "tostring", "rand"]);

/** 지역 변수로 쓸 수 있는 이름인가 (두 언어 모두에서) */
export function isLocalName(name: string): boolean {
  return IDENTIFIER.test(name) && /^[a-z_]/.test(name) && !LUA_KEYWORDS.has(name) && !RUBY_KEYWORDS.has(snakeCase(name)) && !GENERATED_NAMES.has(name);
}
