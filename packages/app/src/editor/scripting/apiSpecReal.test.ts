// 진짜 명세 파일로 보는 파서와 자동완성: 앱의 엔진 사본(templates/resources/api/initial2d-api.json), 내장 기본값
// (api-fallback.json), 엔진 저장소(INITIAL2D_DIR, 기본 ../Initial2D)의 원본(없으면 건너뜀). 명세의 키가 파서에서 빠지면 실패한다.

import { MemoryBackend } from "@initial-editor/core/testing";
import { existsSync, readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import fallbackJson from "./api-fallback.json";
import { parseApiSpec } from "./apiSpec";
import { analyzePrefix, buildIndex, candidates } from "./completionModel";
import { API_SPEC_PATH, fallbackSpec, loadApiSpec } from "./specLoader";

const TEMPLATE_SPEC = path.resolve(__dirname, "..", "..", "..", "templates", "resources", "api", "initial2d-api.json");
const engineDir = path.resolve(process.env.INITIAL2D_DIR ?? path.join(__dirname, "..", "..", "..", "..", "..", "..", "Initial2D"));
const ENGINE_SPEC = path.join(engineDir, "resources", "api", "initial2d-api.json");

const templateText = readFileSync(TEMPLATE_SPEC, "utf8");
const templateRaw: unknown = JSON.parse(templateText);

/** raw 의 키와 값이 parsed 의 같은 경로에 모두 있는지 보고, 빠지거나 다른 경로를 돌려준다 */
function missingKeys(raw: unknown, parsed: unknown, at: string, skip: ReadonlySet<string> = new Set()): string[] {
  if (Array.isArray(raw)) {
    if (!Array.isArray(parsed) || parsed.length !== raw.length) return [`${at} (배열 길이 불일치)`];
    return raw.flatMap((item, i) => missingKeys(item, parsed[i], `${at}[${i}]`, skip));
  }
  if (typeof raw === "object" && raw !== null) {
    if (typeof parsed !== "object" || parsed === null || Array.isArray(parsed)) return [`${at} (객체 아님)`];
    const out: string[] = [];
    for (const [key, value] of Object.entries(raw)) {
      const where = `${at}.${key}`;
      if (skip.has(where)) continue;
      if (key in parsed) out.push(...missingKeys(value, (parsed as Record<string, unknown>)[key], where, skip));
      else out.push(where);
    }
    return out;
  }
  return Object.is(raw, parsed) ? [] : [`${at} (값 불일치: ${JSON.stringify(raw)} 대 ${JSON.stringify(parsed)})`];
}

describe("명세 파일의 키는 파서를 지나도 모두 남는다", () => {
  it("앱의 엔진 사본 (templates/resources/api/initial2d-api.json)", () => {
    expect(missingKeys(templateRaw, parseApiSpec(templateRaw), "$")).toEqual([]);
  });

  it("내장 기본값 (api-fallback.json, 설명용 _comment 제외)", () => {
    expect(missingKeys(fallbackJson, fallbackSpec(), "$", new Set(["$._comment"]))).toEqual([]);
  });

  it.skipIf(!existsSync(ENGINE_SPEC))(`엔진 원본 (${ENGINE_SPEC})`, () => {
    const raw: unknown = JSON.parse(readFileSync(ENGINE_SPEC, "utf8"));
    expect(missingKeys(raw, parseApiSpec(raw), "$")).toEqual([]);
  });

  it("검사 함수는 빠진 키와 다른 값을 찾는다", () => {
    expect(missingKeys({ a: 1, b: { c: [1, 2] } }, { a: 1, b: { c: [1] } }, "$")).toEqual(["$.b.c (배열 길이 불일치)"]);
    expect(missingKeys({ a: 1, d: true }, { a: 2 }, "$")).toEqual(["$.a (값 불일치: 1 대 2)", "$.d"]);
  });
});

describe("앱의 엔진 사본으로 만든 자동완성", () => {
  const spec = parseApiSpec(templateRaw);
  const lua = buildIndex(spec, "lua");
  const ruby = buildIndex(spec, "ruby");

  it("씬 계약 스니펫은 엔진이 부르는 이름: Lua Initialize, Update(elapsed_ms), Ruby init, update(elapsed_ms)", () => {
    expect(lua.hooks.map((h) => h.label)).toEqual(["Initialize", "Update", "Render", "Destroy"]);
    expect(lua.hooks[1].insert).toBe("function Update(elapsed_ms)\n\t$0\nend");
    expect(lua.hooks.every((h) => h.doc.includes("필수 함수"))).toBe(true);
    expect(ruby.hooks.map((h) => h.label)).toEqual(["init", "update", "render", "destroy"]);
    expect(ruby.hooks[1].insert).toBe("def update(elapsed_ms)\n\t$0\nend");
  });

  it("이미 정의한 씬 함수의 스니펫은 나오지 않는다", () => {
    const luaHooks = candidates(lua, analyzePrefix("", "lua"), "lua", "function Initialize()\nend\n").filter((s) => s.kind === "hook");
    expect(luaHooks.map((h) => h.label)).toEqual(["Update", "Render", "Destroy"]);
    const rubyHooks = candidates(ruby, analyzePrefix("", "ruby"), "ruby", "def init\nend\ndef render\nend\n").filter((s) => s.kind === "hook");
    expect(rubyHooks.map((h) => h.label)).toEqual(["update", "destroy"]);
  });

  it("Ruby Audio.play_music 의 loop 는 선택 인자, Lua PlayMusic 은 셋 다 필수", () => {
    const rb = ruby.callables.get("Audio.play_music")!;
    expect(rb.insert).toBe("play_music(${1:path}, ${2:id})");
    expect(rb.detail).toBe("Audio.play_music(path, id, loop = true) -> boolean");
    const lu = lua.callables.get("Audio.PlayMusic")!;
    expect(lu.insert).toBe("PlayMusic(${1:path}, ${2:id}, ${3:loop})");
    expect(lu.detail).toBe("Audio.PlayMusic(path, id, loop) -> nil");
  });

  it("Lua 의 여러 반환과 Ruby 의 배열 반환, Ruby 인자 타입", () => {
    expect(lua.callables.get("Sprite.GetPosition")!.detail).toBe("Sprite.GetPosition(id) -> number, number");
    expect(ruby.callables.get("#position")!.detail).toBe("Sprite#position -> number[]  (Sprite)");
    expect(ruby.callables.get("Input.key_down?")!.params[0].type).toBe("integer|symbol");
  });
});

describe("loadApiSpec: 프로젝트 파일과 내장 기본값이 같은 파서를 쓴다", () => {
  it("프로젝트에 명세가 있으면 그 파일, 없으면 내장 기본값. 둘 다 씬 계약이 언어별 이름이다", async () => {
    const withSpec = new MemoryBackend({ [API_SPEC_PATH]: templateText });
    await withSpec.open("/mem/with-spec");
    const project = await loadApiSpec(withSpec, true);
    expect(project.source).toBe("project");
    expect(project.problem).toBeUndefined();
    expect(project.spec).toEqual(parseApiSpec(templateText));

    const bare = new MemoryBackend({ "game.json": "{}" });
    await bare.open("/mem/bare");
    const fallback = await loadApiSpec(bare, true);
    expect(fallback.source).toBe("fallback");
    expect(fallback.spec).toEqual(parseApiSpec(fallbackJson));
    for (const loaded of [project, fallback]) {
      expect(buildIndex(loaded.spec, "lua").hooks.map((h) => h.label)).toEqual(["Initialize", "Update", "Render", "Destroy"]);
      expect(buildIndex(loaded.spec, "ruby").hooks.map((h) => h.label)).toEqual(["init", "update", "render", "destroy"]);
      expect(buildIndex(loaded.spec, "ruby").callables.get("Audio.play_music")!.insert).toBe("play_music(${1:path}, ${2:id})");
      expect(buildIndex(loaded.spec, "lua").callables.get("Audio.PlayMusic")!.insert).toBe("PlayMusic(${1:path}, ${2:id}, ${3:loop})");
    }
  });

  it("읽지 못한 명세는 내장 기본값으로 대신하고 이유를 남긴다", async () => {
    const broken = new MemoryBackend({ [API_SPEC_PATH]: "{ not json" });
    await broken.open("/mem/broken");
    const loaded = await loadApiSpec(broken, true);
    expect(loaded.source).toBe("fallback");
    expect(loaded.problem).toContain(API_SPEC_PATH);
    expect(loaded.spec).toEqual(fallbackSpec());
  });
});
