import { describe, expect, it } from "vitest";
import { fixtureGame, fixtureItems } from "../testing/fixtures";
import { bareProjectPath, GameConfigError, itemIds, ItemTableError, mapByName, mapEntryFor, mapReadOnlyReason, parseGameConfig, parseItemTable } from "./game";

function config(patch: Record<string, unknown>): string {
  return JSON.stringify({ version: 1, maps: [], items: "resources/data/items.json", ...patch });
}

function fatal(text: string): GameConfigError {
  try {
    parseGameConfig(text);
  } catch (e) {
    if (e instanceof GameConfigError) return e;
    throw e;
  }
  throw new Error("오류가 나야 한다");
}

describe("rpg-game.json", () => {
  it("엔진의 설정: 맵 넷, 아이템 표, 실행 변수", () => {
    const g = fixtureGame();
    expect(g.problems).toEqual([]);
    expect(g.maps.map((m) => [m.name, m.file, m.alt, m.def])).toEqual([
      ["port_town", "resources/maps/port_town.json", [], "scripts/lua/maps/port_town.lua"],
      ["inn", "resources/maps/inn.json", [], "scripts/lua/maps/inn.lua"],
      ["village", "resources/maps/village.json", ["resources/maps/village_rtp.json"], "scripts/lua/maps/village.lua"],
      ["room", "resources/maps/room.json", ["resources/maps/room_rtp.json"], "scripts/lua/maps/room.lua"],
    ]);
    expect(g.items).toBe("resources/data/items.json");
    expect(g.play!.env).toMatchObject({ INITIAL2D_SCRIPT: "lua", INITIAL2D_SCENE: "rpg", INITIAL2D_MAP: "{rpg.map}", INITIAL2D_RPG_AT: "{cx},{cy},{dir}" });
    expect(g.play!.probe).toEqual({ INITIAL2D_AUTOPLAY: "1", INITIAL2D_RPG_ROUTE: "{route}", INITIAL2D_RPG_HOLD: "{event}", INITIAL2D_RPG_TRACE: "1" });
    expect(mapByName(g, "inn")!.file).toBe("resources/maps/inn.json");
    expect(mapByName(g, "forest")).toBeUndefined();
  });

  it("mapEntryFor: 등록된 file, alt, 등록 안 됨", () => {
    const g = fixtureGame();
    const port = mapEntryFor(g, "resources/maps/port_town.json");
    expect(port).toMatchObject({ role: "file", entry: { name: "port_town" } });
    expect(mapReadOnlyReason(port)).toBeNull();
    const villageFile = mapEntryFor(g, "resources/maps/village.json");
    expect(villageFile).toMatchObject({ role: "file", entry: { name: "village" } });
    expect(mapReadOnlyReason(villageFile)).toContain("alt 로 등록된 맵 (RTP 버전과 기본 버전 두 파일): 이벤트를 두 파일에 따로 저장해야 하므로 편집 불가. Lua 정의 파일에서 편집");
    const roomAlt = mapEntryFor(g, "resources/maps/room_rtp.json");
    expect(roomAlt).toMatchObject({ role: "alt", entry: { name: "room" } });
    expect(mapReadOnlyReason(roomAlt)).toContain("alt 로 등록된 맵 (RTP 버전과 기본 버전 두 파일): 이벤트를 두 파일에 따로 저장해야 하므로 편집 불가. Lua 정의 파일에서 편집");
    expect(mapEntryFor(g, "resources/maps/aldebaran_forest.json")).toBeNull();
    expect(mapEntryFor(g, "resources/maps/sample.json")).toBeNull();
    expect(mapEntryFor(null, "resources/maps/port_town.json")).toBeNull();
    expect(mapReadOnlyReason(null)).toBeNull();
    // 경로의 두 꼴과 역슬래시
    expect(mapEntryFor(g, "./resources/maps/inn.json")?.entry.name).toBe("inn");
    expect(mapEntryFor(g, "resources\\maps\\inn.json")?.entry.name).toBe("inn");
    expect(bareProjectPath("././resources//maps/a.json")).toBe("resources/maps/a.json");
  });

  it("파일 전체를 쓸 수 없는 경우는 위치와 함께 던진다", () => {
    expect(fatal("{").message).toContain("rpg-game.json: JSON 구문 오류");
    expect(fatal('"a"').message).toContain("객체여야 함");
    expect(fatal(config({ version: 2 })).location).toBe("version");
    expect(fatal(JSON.stringify({ maps: [] })).location).toBe("version");
    expect(fatal(config({ maps: { a: 1 } })).location).toBe("maps");
    expect(fatal(config({ maps: "x" })).location).toBe("maps");
    // 빈 객체는 엔진에게 빈 배열이다
    expect(parseGameConfig(config({ maps: {} })).maps).toEqual([]);
  });

  it("틀린 maps 항목은 빼고 경로와 함께 알린다 (나머지는 등록된다)", () => {
    const g = parseGameConfig(
      config({
        maps: [
          { name: "a", file: "resources/maps/a.json", def: "scripts/lua/maps/a.lua" },
          null,
          { name: "a", file: "x.json", def: "x.lua" },
          { name: "", file: "", def: 3 },
          { name: "b", file: "b.json", def: "b.lua", alt: "b_rtp.json" },
          { name: "c", file: "c.json", def: "c.lua", alt: ["c_rtp.json", ""] },
          { name: "d", file: "./d.json", def: "d.lua", alt: [] },
        ],
      }),
    );
    expect(g.maps.map((m) => m.name)).toEqual(["a", "d"]);
    expect(g.maps[1].file).toBe("d.json");
    expect(g.problems.map((p) => p.path)).toEqual(["maps[2]", "maps[3].name", "maps[4].name", "maps[4].file", "maps[4].def", "maps[5].alt", "maps[6].alt[2]"]);
    expect(mapReadOnlyReason(mapEntryFor(g, "d.json"))).toBeNull();
  });

  it("items 경로가 없거나 틀리면 알리고 null, play 의 글이 아닌 값은 뺀다", () => {
    const noItems = parseGameConfig(JSON.stringify({ version: 1, maps: [] }));
    expect(noItems.items).toBeNull();
    expect(noItems.problems).toEqual([{ path: "items", message: "아이템 표 경로 없음" }]);
    expect(parseGameConfig(config({ items: 3 })).problems[0].path).toBe("items");
    const play = parseGameConfig(config({ play: { env: { A: "1", B: 2 }, probe: "x" } }));
    expect(play.play).toEqual({ env: { A: "1" }, probe: {} });
    expect(play.problems.map((p) => p.path)).toEqual(["play.env.B", "play.probe"]);
    expect(parseGameConfig(config({})).play).toBeNull();
  });
});

describe("items.json", () => {
  it("엔진의 아이템 표", () => {
    const t = fixtureItems();
    expect(t.problems).toEqual([]);
    expect(t.items.map((i) => i.id)).toEqual(["warehouse_key", "lamp_oil", "silver", "shell"]);
    expect(t.items[0]).toMatchObject({ name: "창고 열쇠", order: 10 });
    expect([...itemIds(t)]).toContain("shell");
    expect(itemIds(null).size).toBe(0);
  });

  it("틀린 항목은 빼고 알린다", () => {
    const t = parseItemTable(JSON.stringify({ items: [{ id: "a" }, null, { id: "a" }, { id: "b", name: 3, order: 1.5 }, { id: "c", desc: "d", order: 2 }] }));
    expect(t.items.map((i) => i.id)).toEqual(["a", "c"]);
    expect(t.problems.map((p) => p.path)).toEqual(["items[2]", "items[3].id", "items[4].name", "items[4].order"]);
    expect(() => parseItemTable("[1]")).toThrow(ItemTableError);
    expect(() => parseItemTable(JSON.stringify({ items: { a: 1 } }))).toThrow(/아이템 목록은 배열이어야 함/);
    expect(() => parseItemTable("{")).toThrow(ItemTableError);
  });
});
