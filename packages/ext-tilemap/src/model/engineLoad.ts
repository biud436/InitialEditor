// 엔진이 맵 파일을 여는 규칙 (Initial2D src/Tilemap.cpp 의 Tilemap::load). 씬의 타일맵이 가리키는 맵 파일을
// 엔진이 받아들일지 미리 가린다. 에디터의 parseMap 보다 느슨한 곳(objects, events 는 보지 않고 칸은 음수도 받는다)과
// 엄격한 곳(레이어와 타일셋이 비면 안 되고 collision 키가 있으면 칸 수가 맞아야 한다)이 모두 엔진 그대로다.
// 타일셋 그림이 있는지는 파일 시스템을 봐야 하므로 부르는 쪽이 tilesetImages 로 받아 확인한다.

/** 받아들이면 타일셋 그림(프로젝트 기준)과 맵 크기(칸, jsoncpp 의 asInt 로 읽은 값) */
export type EngineMapCheck = { ok: true; images: string[]; width: number; height: number } | { ok: false; reason: string };

function isIntegral(v: unknown): v is number {
  return typeof v === "number" && Number.isInteger(v);
}

/** jsoncpp 의 asInt: 정수와 참거짓과 null 은 수로, 글과 배열과 객체는 읽지 못한다(undefined) */
function asInt(v: unknown): number | undefined {
  if (v === undefined || v === null) return 0;
  if (typeof v === "boolean") return v ? 1 : 0;
  if (typeof v === "number") return Math.trunc(v);
  return undefined;
}

/** jsoncpp 의 asString: 글은 그대로, null 과 없음은 빈 글, 수와 참거짓은 글로, 배열과 객체는 읽지 못한다 */
function asString(v: unknown): string | undefined {
  if (v === undefined || v === null) return "";
  if (typeof v === "string") return v;
  if (typeof v === "number" || typeof v === "boolean") return String(v);
  return undefined;
}

function field(node: unknown, key: string): unknown {
  return node !== null && typeof node === "object" && !Array.isArray(node) ? (node as Record<string, unknown>)[key] : undefined;
}

function intArrayOk(node: unknown, expected: number): boolean {
  return Array.isArray(node) && node.length === expected && node.every(isIntegral);
}

/** 프로젝트 기준 경로로 (앞의 ./ 와 겹친 / 를 뗀다). 엔진은 작업 폴더(프로젝트 루트) 기준으로 연다 */
export function projectPathOf(image: string): string {
  return image.replace(/\\/g, "/").replace(/^(\.\/)+/, "").replace(/\/{2,}/g, "/");
}

/**
 * 엔진의 Tilemap::load 가 이 글을 받아들이는지. 받아들이면 타일셋 그림 경로(프로젝트 기준)와 맵 크기를 돌려준다.
 * 이유 글은 엔진의 오류와 같은 뜻의 한국어다
 */
export function checkEngineMap(text: string): EngineMapCheck {
  let root: unknown;
  try {
    root = JSON.parse(text);
  } catch (e) {
    return { ok: false, reason: `JSON 구문 오류: ${(e as Error).message}` };
  }
  const rawVersion = field(root, "version");
  const version = asInt(rawVersion);
  if (version !== 1 && version !== 2) {
    const shown = rawVersion === undefined ? "없음" : JSON.stringify(rawVersion);
    return { ok: false, reason: `지원하지 않는 맵 버전: ${shown} (지원: 1, 2)` };
  }

  const [width, height, tileWidth, tileHeight] = ["width", "height", "tileWidth", "tileHeight"].map((k) => asInt(field(root, k)));
  if ([width, height, tileWidth, tileHeight].some((n) => n === undefined || n <= 0)) {
    return { ok: false, reason: "맵 크기나 타일 크기가 0 이하" };
  }
  const cells = width! * height!;

  const layers = field(root, "layers");
  if (!Array.isArray(layers) || layers.length === 0) return { ok: false, reason: "레이어 없음" };
  for (const layer of layers) {
    if (asString(field(layer, "name")) === undefined) return { ok: false, reason: "레이어 이름은 문자열이어야 함" };
    if (!intArrayOk(field(layer, "data"), cells)) {
      return { ok: false, reason: `레이어 "${asString(field(layer, "name")) ?? ""}"의 data 길이가 너비 x 높이와 다르거나 정수가 아닌 요소 포함` };
    }
  }

  if (root !== null && typeof root === "object" && "collision" in root) {
    if (!intArrayOk(field(root, "collision"), cells)) {
      return { ok: false, reason: "collision 길이가 너비 x 높이와 다르거나 정수가 아닌 요소 포함" };
    }
  }

  const tilesets = field(root, "tilesets");
  if (!Array.isArray(tilesets) || tilesets.length === 0) return { ok: false, reason: "타일셋 없음" };
  const images: string[] = [];
  for (const tileset of tilesets) {
    const image = asString(field(tileset, "image"));
    const firstGid = asInt(field(tileset, "firstGid"));
    const columns = asInt(field(tileset, "columns"));
    if (!image || firstGid === undefined || firstGid < 1 || columns === undefined || columns < 1) {
      return { ok: false, reason: "잘못된 타일셋 항목 (필요: image, firstGid 1 이상, columns 1 이상)" };
    }
    images.push(projectPathOf(image));
  }
  return { ok: true, images, width: width!, height: height! };
}
