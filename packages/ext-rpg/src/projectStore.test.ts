// ext-rpg 의 프로젝트 저장소 (e5 문서 2.4): 열 때 한 번에 읽고 알린다, 파일이 바뀌면 그 부분만 다시 읽고 알린다,
// 실패는 이유로 남긴다(던지지 않는다), 파일 목록, 정의 파일의 어림 id, 시작 상태의 기억, 닫으면 비운다.
import { describe, expect, it, vi } from "vitest";
import { PLAY_MEMORY_PATH } from "./model/play";
import { EVENT_SCHEMA_PATH } from "./model/schema";
import { RpgProjectStore } from "./projectStore";
import { memoryWorkspace, rpgProjectFiles } from "./testing/workspace";

async function opened(files?: Record<string, string | Uint8Array>) {
  const m = memoryWorkspace(files);
  const onChange = vi.fn();
  const store = new RpgProjectStore({ workspace: m.ws, onChange });
  await m.open();
  await vi.waitFor(() => expect(store.loaded).toBe(true));
  return { m, store, onChange };
}

describe("열기", () => {
  it("스키마, 설정, 아이템 표, 파일 목록, 맵의 events 를 읽고 한 번 알린다", async () => {
    const { store, onChange } = await opened();
    expect(onChange).toHaveBeenCalledTimes(1);
    expect(store.schemaPresent).toBe(true);
    expect(store.schema?.commands).toHaveLength(17);
    expect(store.schemaProblem).toBeNull();
    expect(store.game?.maps.map((m) => m.name)).toEqual(["port_town", "inn", "village", "room"]);
    expect(store.items?.items.map((i) => i.id)).toContain("warehouse_key");
    expect(store.fileExists?.("resources/charsets/placeholder.png")).toBe(true);
    expect(store.fileExists?.("./resources/charsets/placeholder.png")).toBe(true);
    expect(store.fileExists?.("resources/rtp/CharSet/People1.png")).toBe(false);
    expect(store.fileList()).toContain("resources/maps/port_town.json");
    expect(store.mapEvents.get("resources/maps/port_town.json")).toHaveLength(17);
    expect(store.mapEvents.get("resources/maps/inn.json")).toHaveLength(6);
    // 정의 파일: port_town 은 있고 이벤트 id 가 없다, 여관은 없다
    expect(store.defIds("scripts/lua/maps/port_town.lua")).toEqual(new Set());
    expect(store.defIds("scripts/lua/maps/inn.lua")).toBeNull();
  });

  it("스키마가 없는 프로젝트(플래피)는 schemaPresent 가 거짓이고 문제 없이 알린다", async () => {
    const files = rpgProjectFiles();
    delete files[EVENT_SCHEMA_PATH];
    delete files["resources/data/rpg-game.json"];
    const { store, onChange } = await opened(files);
    expect(store.schemaPresent).toBe(false);
    expect(store.schema).toBeNull();
    expect(store.schemaProblem).toBeNull();
    expect(store.gameProblem).toBe("파일 없음");
    expect(onChange).toHaveBeenCalledTimes(1);
  });

  it("모르는 버전의 스키마는 잠금 문구로 남는다", async () => {
    const files = rpgProjectFiles();
    files[EVENT_SCHEMA_PATH] = JSON.stringify({ ...JSON.parse(files[EVENT_SCHEMA_PATH] as string), version: 2 });
    const { store, m } = await opened(files);
    expect(store.schemaPresent).toBe(true);
    expect(store.schema).toBeNull();
    expect(store.schemaProblem).toBe("지원하지 않는 event-commands.json 버전: 2 (이 에디터는 버전 1 만 편집 가능)");
    expect(m.logs.some(([level, text]) => level === "warn" && text === store.schemaProblem)).toBe(true);
  });

  it("틀린 JSON 도 던지지 않고 이유를 남긴다", async () => {
    const files = rpgProjectFiles();
    files[EVENT_SCHEMA_PATH] = "{ 틀림";
    files["resources/data/rpg-game.json"] = "3";
    const { store } = await opened(files);
    expect(store.schemaProblem).toMatch(/^event-commands.json 형식 오류: JSON 구문 오류/);
    expect(store.gameProblem).toBe("설정은 객체여야 함");
  });

  it("열 때 이미 프로젝트가 열려 있으면 바로 읽는다", async () => {
    const m = memoryWorkspace();
    await m.open();
    const store = new RpgProjectStore({ workspace: m.ws });
    await vi.waitFor(() => expect(store.loaded).toBe(true));
    expect(store.schema).not.toBeNull();
  });
});

describe("바뀐 파일", () => {
  it("스키마의 버전이 바뀌면 다시 읽고 알린다, 지우면 schemaPresent 가 거짓", async () => {
    const { store, m, onChange } = await opened();
    const text = rpgProjectFiles()[EVENT_SCHEMA_PATH] as string;
    m.backend.simulateExternalChange(EVENT_SCHEMA_PATH, "modify", JSON.stringify({ ...JSON.parse(text), version: 3 }));
    await vi.waitFor(() => expect(onChange).toHaveBeenCalledTimes(2));
    expect(store.schemaProblem).toMatch(/지원하지 않는 event-commands.json 버전: 3/);
    m.backend.simulateExternalChange(EVENT_SCHEMA_PATH, "delete");
    await vi.waitFor(() => expect(onChange).toHaveBeenCalledTimes(3));
    expect(store.schemaPresent).toBe(false);
    expect(store.schemaProblem).toBeNull();
  });

  it("설정이 바뀌면 아이템 표와 맵의 events 도 다시 읽는다", async () => {
    const { store, m, onChange } = await opened();
    const game = JSON.parse(rpgProjectFiles()["resources/data/rpg-game.json"] as string);
    game.maps = game.maps.filter((x: { name: string }) => x.name !== "inn");
    await m.backend.writeText("resources/data/rpg-game.json", JSON.stringify(game));
    await vi.waitFor(() => expect(onChange).toHaveBeenCalledTimes(2));
    expect(store.game?.maps.map((x) => x.name)).toEqual(["port_town", "village", "room"]);
    expect(store.mapEvents.has("resources/maps/inn.json")).toBe(false);
  });

  it("아이템 표가 바뀌면 다시 읽고 알린다", async () => {
    const { store, m, onChange } = await opened();
    await m.backend.writeText("resources/data/items.json", JSON.stringify({ items: [{ id: "pearl", name: "진주" }] }));
    await vi.waitFor(() => expect(onChange).toHaveBeenCalledTimes(2));
    expect(store.items?.items.map((i) => i.id)).toEqual(["pearl"]);
  });

  it("정의 파일이 바뀌면 어림 id 를 다시 읽는다", async () => {
    const { store, m } = await opened();
    await m.backend.writeText("scripts/lua/maps/port_town.lua", 'return { events = { { id = "captain" } } }\n');
    await vi.waitFor(() => expect(store.defIds("scripts/lua/maps/port_town.lua")).toEqual(new Set(["captain"])));
  });

  it("맵 파일이 바뀌면 제안용 events 를 다시 읽는다 (레이어는 알리지 않는다)", async () => {
    const { store, m, onChange } = await opened();
    const map = JSON.parse(rpgProjectFiles()["resources/maps/inn.json"] as string);
    map.events = map.events.slice(0, 2);
    await m.backend.writeText("resources/maps/inn.json", JSON.stringify(map));
    await vi.waitFor(() => expect(store.mapEvents.get("resources/maps/inn.json")).toHaveLength(2));
    expect(onChange).toHaveBeenCalledTimes(1);
    expect(store.projectEvents("resources/maps/inn.json", ["지금"])).toEqual([store.mapEvents.get("resources/maps/port_town.json"), ["지금"]]);
  });

  it("등록된 맵 파일의 엔진 판정: 있으면 null, 없으면 이유, 엔진 규칙에 어긋나거나 타일셋 그림이 없으면 이유. 파일이 바뀌면 다시 판정한다", async () => {
    const { store, m } = await opened();
    expect(store.mapFileProblem("resources/maps/inn.json")).toBeNull();
    expect(store.mapFileProblem("./resources/maps/port_town.json")).toBeNull();
    expect(store.mapFileProblem("resources/maps/village.json")).toBe("맵 파일 없음: resources/maps/village.json");
    // 등록되지 않은 경로는 모른다
    expect(store.mapFileProblem("resources/maps/meadow.json")).toBeUndefined();
    const inn = JSON.parse(rpgProjectFiles()["resources/maps/inn.json"] as string);
    await m.backend.writeText("resources/maps/room.json", JSON.stringify({ ...inn, version: 9 }));
    await vi.waitFor(() => expect(store.mapFileProblem("resources/maps/room.json")).toBe("엔진이 열 수 없는 맵: 지원하지 않는 맵 버전: 9 (지원: 1, 2)"));
    await m.backend.writeText("resources/maps/village.json", JSON.stringify({ ...inn, tilesets: [{ image: "./resources/tiles/none.png", firstGid: 1, columns: 8 }] }));
    await vi.waitFor(() => expect(store.mapFileProblem("resources/maps/village.json")).toBe("엔진이 열 수 없는 맵: 타일셋 이미지 없음 (resources/tiles/none.png)"));
    await m.backend.writeText("resources/tiles/none.png", "png");
    expect(store.mapFileProblem("resources/maps/village.json")).toBeNull();
    // resources 밖의 그림은 파일 목록이 모르므로 있다고 본다
    await m.backend.writeText("resources/maps/village.json", JSON.stringify({ ...inn, tilesets: [{ image: "art/tiles.png", firstGid: 1, columns: 8 }] }));
    await vi.waitFor(() => expect(store.mapChecks.get("resources/maps/village.json")).toEqual({ kind: "ok", images: ["art/tiles.png"], width: inn.width, height: inn.height }));
    expect(store.mapFileProblem("resources/maps/village.json")).toBeNull();
    // 엔진이 열 수 있는 맵만 크기를 안다
    expect(store.mapSize("./resources/maps/village.json")).toEqual({ width: inn.width, height: inn.height });
    expect(store.mapSize("resources/maps/room.json")).toBeUndefined();
    await m.backend.remove("resources/maps/inn.json");
    await vi.waitFor(() => expect(store.mapFileProblem("resources/maps/inn.json")).toBe("맵 파일 없음: resources/maps/inn.json"));
    m.close();
    expect(store.mapFileProblem("resources/maps/port_town.json")).toBeUndefined();
  });

  it("resources 아래 파일이 생기거나 지워지면 목록을 고친다", async () => {
    const { store, m } = await opened();
    await m.backend.writeText("resources/rtp/CharSet/People1.png", "png");
    expect(store.fileExists?.("resources/rtp/CharSet/People1.png")).toBe(true);
    await m.backend.remove("resources/rtp");
    expect(store.fileExists?.("resources/rtp/CharSet/People1.png")).toBe(false);
    expect(store.fileExists?.("resources/charsets/placeholder.png")).toBe(true);
  });
});

describe("시작 상태와 닫기", () => {
  it("맵마다의 시작 상태를 .initial-editor/rpg-play.json 에 쓰고, 다시 열면 읽는다", async () => {
    const { store, m } = await opened();
    await store.setStartState("resources/maps/port_town.json", " arrived,item:shell=1 ");
    expect(store.startState("./resources/maps/port_town.json")).toBe("arrived,item:shell=1");
    const written = await m.backend.readText(PLAY_MEMORY_PATH);
    expect(JSON.parse(written)).toEqual({ version: 1, startState: { "resources/maps/port_town.json": "arrived,item:shell=1" } });
    // 에디터가 쓴 변경(self)으로는 다시 읽지 않고, 밖의 변경은 읽는다
    m.backend.simulateExternalChange(PLAY_MEMORY_PATH, "modify", JSON.stringify({ version: 1, startState: { "resources/maps/inn.json": "arrived" } }));
    await vi.waitFor(() => expect(store.startState("resources/maps/inn.json")).toBe("arrived"));
    expect(store.startState("resources/maps/port_town.json")).toBe("");
    await store.setStartState("resources/maps/inn.json", "");
    expect(JSON.parse(await m.backend.readText(PLAY_MEMORY_PATH))).toEqual({ version: 1, startState: {} });
  });

  it("쓰지 못하면 콘솔에 알리고 이번 실행 동안 기억한다", async () => {
    const { store, m } = await opened();
    m.backend.writeText = async () => {
      throw new Error("거부");
    };
    await store.setStartState("resources/maps/port_town.json", "arrived");
    expect(store.startState("resources/maps/port_town.json")).toBe("arrived");
    expect(m.logs.at(-1)).toEqual(["warn", `${PLAY_MEMORY_PATH} 쓰기 실패 (이번 실행 중에만 유지): 거부`]);
  });

  it("닫으면 비우고 알린다. 닫는 동안 끝난 읽기는 버린다", async () => {
    const m = memoryWorkspace();
    const onChange = vi.fn();
    const store = new RpgProjectStore({ workspace: m.ws, onChange });
    // 열면 읽기가 시작되고, 끝나기 전에 닫는다
    await m.open();
    m.close();
    await new Promise((r) => setTimeout(r, 10));
    expect(store.schema).toBeNull();
    expect(store.loaded).toBe(false);
    expect(onChange).toHaveBeenCalledTimes(1);
    await m.open();
    await vi.waitFor(() => expect(store.loaded).toBe(true));
    m.close();
    expect(store.schemaPresent).toBe(false);
    expect(store.files).toBeNull();
    expect(onChange).toHaveBeenCalledTimes(3);
  });
});
