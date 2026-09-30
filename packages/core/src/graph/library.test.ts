import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { NodeLibraryError, parseNodeLibrary, splitLibraryRef } from "./library";

const PATH = "scripts/components/flappy/common.nodes.json";
const FLAPPY = readFileSync(join(__dirname, "fixtures", "flappy", "common.nodes.json"), "utf8");

function lib(extra: Record<string, unknown>) {
  return JSON.stringify({ version: 1, name: "game", lua: { require: "scripts/lua/game" }, ruby: { require: "scripts/ruby/game", module: "Game" }, ...extra });
}

describe("노드 라이브러리", () => {
  it("플래피의 common", () => {
    const l = parseNodeLibrary(PATH, FLAPPY);
    expect(l).toMatchObject({ path: PATH, name: "flappy", label: "플래피", luaRequire: "scripts/lua/components/flappy/common", rubyRequire: "scripts/ruby/components/flappy/common", rubyModule: "FlappyCommon" });
    expect(l.constants.map((c) => [c.key, c.type, c.ruby])).toContainEqual(["BIRD_H", "integer", "BIRD_H"]);
    const flap = l.functions.find((f) => f.key === "flapPressed")!;
    expect(flap).toMatchObject({ ruby: "flap_pressed?", returns: "boolean", args: [{ key: "st", type: "state" }] });
    expect(l.functions.find((f) => f.key === "sfx")!.returns).toBeUndefined();
  });

  it("state 를 반환하는 함수는 그 상태 표의 필드를 선언한다", () => {
    const l = parseNodeLibrary(PATH, FLAPPY);
    expect(l.functions.find((f) => f.key === "state")!.fields!.map((f) => f.key)).toEqual(["state", "bird", "H", "GROUND_Y", "readyTime", "birdVy", "birdAngle", "autoplay"]);
    expect(() => parseNodeLibrary("x", lib({ functions: [{ key: "f", returns: "number", fields: [] }] }))).toThrow(/fields는 state 를 반환하는 함수에만/);
    expect(() => parseNodeLibrary("x", lib({ functions: [{ key: "f", returns: "state", fields: [{ key: "a", type: "list" }] }] }))).toThrow(/functions\[0\]\.fields\[0\]\.type/);
  });

  it("Ruby 이름은 없으면 snake_case", () => {
    const l = parseNodeLibrary("x.nodes.json", lib({ functions: [{ key: "resetGame", args: [] }] }));
    expect(l.functions[0].ruby).toBe("reset_game");
  });

  it("규칙에 어긋나면 NodeLibraryError", () => {
    const bad = (text: string, message: RegExp) => expect(() => parseNodeLibrary("x.nodes.json", text)).toThrow(message);
    bad("{", /JSON 구문 오류/);
    bad(JSON.stringify({ version: 2 }), /라이브러리 버전: 2/);
    bad(lib({ name: "st" }), /name은 소문자로 시작하는 식별자/);
    bad(lib({ name: "Game" }), /name은 소문자로 시작하는 식별자/);
    bad(lib({ ruby: { require: "x" } }), /ruby\.module가 필요합니다/);
    bad(lib({ ruby: { require: "x", module: "game" } }), /Ruby 상수 이름/);
    bad(lib({ constants: [{ key: "A", type: "number" }, { key: "A", type: "number" }] }), /key 중복: A/);
    bad(lib({ constants: [{ key: "A", type: "table" }] }), /constants\[0\]\.type/);
    bad(lib({ functions: [{ key: "f", args: [{ key: "a", type: "enum" }] }] }), /values는 비어 있지 않은 문자열/);
    bad(lib({ functions: [{ key: "f", args: [{ key: "a", type: "number" }, { key: "a", type: "number" }] }] }), /key 중복: a/);
    bad(lib({ functions: [{ key: "f", ruby: "Bad-name" }] }), /Ruby 메서드 이름/);
    bad(lib({ functions: [{ key: "f", returns: "list" }] }), /returns는/);
    expect(() => parseNodeLibrary("x", "{")).toThrow(NodeLibraryError);
  });

  it("참조 나누기", () => {
    expect(splitLibraryRef("flappy.GRAVITY")).toEqual(["flappy", "GRAVITY"]);
    expect(splitLibraryRef("flappy")).toBeNull();
    expect(splitLibraryRef(".x")).toBeNull();
  });
});
