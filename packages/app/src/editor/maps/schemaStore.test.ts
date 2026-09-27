import { DocumentRegistry, Emitter, LogStore, Project, type ProjectInfo } from "@initial-editor/core";
import { MemoryBackend, waitFor } from "@initial-editor/core/testing";
import { MapDocument, SCHEMA_PATH } from "@initial-editor/ext-tilemap/model";
import { describe, expect, it } from "vitest";
import { MapSchemaStore, type MapSchemaHost } from "./schemaStore";

const MAP_PATH = "resources/maps/tiny.json";
const MAP = JSON.stringify({
  version: 2,
  name: "tiny",
  width: 4,
  height: 2,
  tileWidth: 16,
  tileHeight: 16,
  layers: [{ name: "ground", data: [1, 1, 1, 1, 1, 1, 1, 1] }],
  tilesets: [{ image: "resources/images/a.png", firstGid: 1, columns: 1 }],
  objects: [{ id: "slime_1", type: "spawn", x: 20, y: 16, props: { species: "slime" } }],
});

const SCHEMA = JSON.stringify({
  version: 1,
  types: [
    { type: "spawn", label: "몬스터", fields: [{ name: "species", type: "enum", values: ["slime", "bat"] }] },
    { type: "start", label: "시작 지점", unique: true },
  ],
  play: { env: { STAGE: "{map.name}" } },
});

interface Harness {
  mem: MemoryBackend;
  host: MapSchemaHost;
  events: Emitter<{ projectOpened: ProjectInfo; projectClosed: void }>;
  log: LogStore;
  open(): Promise<void>;
  close(): Promise<void>;
}

function harness(files: Record<string, string> = {}): Harness {
  const mem = new MemoryBackend({ "game.json": "{}", [MAP_PATH]: MAP, ...files });
  const project = new Project(mem);
  const documents = new DocumentRegistry();
  const log = new LogStore();
  const events = new Emitter<{ projectOpened: ProjectInfo; projectClosed: void }>();
  const host: MapSchemaHost = { backend: mem, project, documents, log, events };
  return {
    mem,
    host,
    events,
    log,
    async open() {
      const info = await project.open("/home/u/game");
      events.emit("projectOpened", info);
    },
    async close() {
      await project.close();
      events.emit("projectClosed", undefined);
    },
  };
}

const texts = (log: LogStore) => log.entries.map((e) => `${e.level}/${e.source}: ${e.text}`);

describe("MapSchemaStore", () => {
  it("프로젝트를 열면 스키마를 읽고 타입 수를 콘솔에 남기며, 열린 맵과 새로 여는 맵에 넣는다", async () => {
    const h = harness({ [SCHEMA_PATH]: SCHEMA });
    const store = new MapSchemaStore(h.host);
    store.install();
    const before = await MapDocument.open(h.mem, MAP_PATH).catch(() => null);
    expect(before).toBeNull(); // 프로젝트가 닫혀 있으면 백엔드가 거부한다

    await h.open();
    const early = await MapDocument.open(h.mem, MAP_PATH);
    h.host.documents.open(early);
    await waitFor(() => store.current !== null);
    expect(store.source).toBe("project");
    expect(store.error).toBeNull();
    expect(store.current!.types.map((t) => t.type)).toEqual(["spawn", "start"]);
    expect(early.schema).toBe(store.current);
    expect(texts(h.log).some((l) => l.startsWith("info/maps: 맵 오브젝트 스키마: 타입 2개 (spawn, start)"))).toBe(true);

    // 나중에 연 맵에도 들어간다 (다른 경로로 같은 파일을 여는 것처럼 두 번째 문서)
    h.mem.files.set("resources/maps/other.json", new TextEncoder().encode(MAP));
    const later = await MapDocument.open(h.mem, "resources/maps/other.json");
    expect(later.schema).toBeNull();
    h.host.documents.open(later);
    expect(later.schema).toBe(store.current);
    store.dispose();
  });

  it("콘솔 한 줄에 여기서 실행과 play.maps 목록을 적는다", async () => {
    const withMaps = JSON.stringify({ ...JSON.parse(SCHEMA), play: { env: { STAGE: "{map.name}" }, maps: ["aldebaran_*", "boss"] } });
    const h = harness({ [SCHEMA_PATH]: withMaps });
    const store = new MapSchemaStore(h.host);
    store.install();
    await h.open();
    await waitFor(() => store.current !== null);
    expect(store.current!.play?.maps).toEqual(["aldebaran_*", "boss"]);
    expect(texts(h.log)).toContain("info/maps: 맵 오브젝트 스키마: 타입 2개 (spawn, start), 여기서 실행 있음 (맵 aldebaran_*, boss)");
    h.mem.simulateExternalChange(SCHEMA_PATH, "modify", SCHEMA);
    await waitFor(() => store.current?.play?.maps === undefined);
    expect(texts(h.log).at(-1)).toBe("info/maps: 맵 오브젝트 스키마: 타입 2개 (spawn, start), 여기서 실행 있음");
    // 목록이 글의 배열이 아니면 스키마 오류다
    h.mem.simulateExternalChange(SCHEMA_PATH, "modify", JSON.stringify({ ...JSON.parse(SCHEMA), play: { env: {}, maps: "aldebaran_*" } }));
    await waitFor(() => store.error !== null);
    expect(store.error).toContain("play.maps");
    store.dispose();
  });

  it("해석 오류는 error 에 두고 콘솔에 문구를 남기며 던지지 않는다", async () => {
    const h = harness({ [SCHEMA_PATH]: '{ "version": 1, "types": [{ "type": "spawn", "shape": "circle" }] }' });
    const store = new MapSchemaStore(h.host);
    store.install();
    await h.open();
    await waitFor(() => store.error !== null);
    expect(store.current).toBeNull();
    expect(store.source).toBe("none");
    expect(store.error).toMatch(/spawn\.shape 는 point, band, rect 중 하나다/);
    expect(texts(h.log).some((l) => l.startsWith("error/maps: 맵 오브젝트 스키마 오류") && l.includes("spawn.shape"))).toBe(true);

    h.mem.simulateExternalChange(SCHEMA_PATH, "modify", "{ not json");
    await waitFor(() => /JSON 이 아니다/.test(store.error ?? ""));
    await expect(store.load()).resolves.toBeNull();
    store.dispose();
  });

  it("파일이 없으면 source 는 none 이고, 파일이 생기거나 바뀌거나 지워지면 다시 읽어 문서에 넣는다", async () => {
    const h = harness();
    const store = new MapSchemaStore(h.host);
    store.install();
    await h.open();
    const doc = await MapDocument.open(h.mem, MAP_PATH);
    h.host.documents.open(doc);
    await waitFor(() => texts(h.log).some((l) => l.includes("스키마가 없다")));
    expect(store.source).toBe("none");
    expect(store.current).toBeNull();

    // 에디터가 저장한 것(self)도 밖에서 바꾼 것(external)도 다시 읽는다
    await h.mem.writeText(SCHEMA_PATH, SCHEMA);
    await waitFor(() => store.current !== null);
    expect(doc.schema?.types).toHaveLength(2);
    expect(doc.problems).toEqual([]);

    h.mem.simulateExternalChange(SCHEMA_PATH, "modify", JSON.stringify({ version: 1, types: [{ type: "start", unique: true }] }));
    await waitFor(() => store.current?.types.length === 1);
    expect(doc.schema).toBe(store.current);
    expect(doc.problems.map((p) => p.message)).toEqual(["스키마에 없는 타입: spawn"]);

    h.mem.simulateExternalChange(SCHEMA_PATH, "delete");
    await waitFor(() => store.current === null);
    expect(doc.schema).toBeNull();
    store.dispose();
  });

  it("프로젝트를 닫으면 비우고, 다른 경로의 변경은 무시한다", async () => {
    const h = harness({ [SCHEMA_PATH]: SCHEMA });
    const store = new MapSchemaStore(h.host);
    store.install();
    await h.open();
    await waitFor(() => store.current !== null);
    const loads = texts(h.log).length;
    await h.mem.writeText("resources/other.json", "{}");
    await new Promise((r) => setTimeout(r, 10));
    expect(texts(h.log).length).toBe(loads);

    await h.close();
    expect(store.current).toBeNull();
    expect(store.source).toBe("none");
    expect(store.error).toBeNull();
    await expect(store.load()).resolves.toBeNull();
    store.dispose();
  });
});
