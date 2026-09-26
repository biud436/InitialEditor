import { Project } from "@initial-editor/core";
import { MemoryBackend } from "@initial-editor/core/testing";
import { describe, expect, it } from "vitest";
import type { KeyValueStorage } from "./LocalStorageSettingsStorage";
import { isLayoutJson, LAYOUT_FILE, LAYOUT_STORAGE_KEY, LayoutPersistence, restoreLayout, type LayoutJson } from "./layoutPersistence";

function memoryStorage(initial: Record<string, string> = {}): KeyValueStorage & { data: Map<string, string> } {
  const data = new Map(Object.entries(initial));
  return { data, getItem: (k) => data.get(k) ?? null, setItem: (k, v) => void data.set(k, v) };
}

const layout = (tag: string): LayoutJson => ({
  grid: { root: { type: "leaf", data: { views: [tag], activeView: tag, id: "g" }, size: 100 }, width: 800, height: 600, orientation: "HORIZONTAL" },
  panels: { [tag]: { id: tag, contentComponent: tag } },
  activeGroup: "g",
});

describe("restoreLayout", () => {
  it("저장된 것이 없으면 기본을 쓴다", () => {
    let defaults = 0;
    expect(restoreLayout(null, () => {}, () => defaults++)).toBe(false);
    expect(defaults).toBe(1);
  });

  it("복원이 던지면 기본으로 돌아가고 경고를 남긴다", () => {
    const warnings: string[] = [];
    let defaults = 0;
    const ok = restoreLayout(
      layout("console"),
      () => {
        throw new Error("모양이 다르다");
      },
      () => defaults++,
      (m) => warnings.push(m),
    );
    expect(ok).toBe(false);
    expect(defaults).toBe(1);
    expect(warnings[0]).toContain("모양이 다르다");
  });

  it("복원이 되면 기본을 부르지 않는다", () => {
    const applied: LayoutJson[] = [];
    let defaults = 0;
    expect(restoreLayout(layout("console"), (l) => void applied.push(l), () => defaults++)).toBe(true);
    expect(applied).toHaveLength(1);
    expect(defaults).toBe(0);
  });
});

describe("isLayoutJson", () => {
  it("grid.root 와 panels 가 있어야 한다", () => {
    expect(isLayoutJson(layout("x"))).toBe(true);
    expect(isLayoutJson(null)).toBe(false);
    expect(isLayoutJson("문자열")).toBe(false);
    expect(isLayoutJson({ grid: {}, panels: {} })).toBe(false);
    expect(isLayoutJson({ grid: { root: {} } })).toBe(false);
  });
});

describe("LayoutPersistence", () => {
  it("프로젝트가 없으면 localStorage 를 쓰고, 깨진 값은 null", async () => {
    const local = memoryStorage({ [LAYOUT_STORAGE_KEY]: "{깨짐" });
    const p = new LayoutPersistence({ local, project: () => null });
    expect(await p.load()).toBeNull();
    await p.save(layout("a"));
    expect(JSON.parse(local.data.get(LAYOUT_STORAGE_KEY)!)).toEqual(layout("a"));
    expect(await p.load()).toEqual(layout("a"));
  });

  it("프로젝트가 열려 있으면 .initial-editor/layout.json 에 쓰고 거기서 먼저 읽는다", async () => {
    const backend = new MemoryBackend({ "game.json": "{}" });
    const project = new Project(backend);
    await project.open("memory://p");
    const local = memoryStorage({ [LAYOUT_STORAGE_KEY]: JSON.stringify(layout("local")) });
    const p = new LayoutPersistence({ local, project: () => project });
    expect(await p.load()).toEqual(layout("local"));
    await p.save(layout("project"));
    expect(await backend.exists(LAYOUT_FILE)).toBe(true);
    expect(JSON.parse(await backend.readText(LAYOUT_FILE))).toEqual(layout("project"));
    // 둘 다에 남는다: 프로젝트가 없을 때의 화면이 마지막 레이아웃을 쓴다
    expect(JSON.parse(local.data.get(LAYOUT_STORAGE_KEY)!)).toEqual(layout("project"));
    await backend.writeText(LAYOUT_FILE, JSON.stringify(layout("edited-outside")));
    expect(await p.load()).toEqual(layout("edited-outside"));
  });

  it("프로젝트 파일이 깨졌으면 경고하고 localStorage 로 넘어간다", async () => {
    const backend = new MemoryBackend({ "game.json": "{}", [LAYOUT_FILE]: "not json" });
    const project = new Project(backend);
    await project.open("memory://p");
    const warnings: string[] = [];
    const local = memoryStorage({ [LAYOUT_STORAGE_KEY]: JSON.stringify(layout("local")) });
    const p = new LayoutPersistence({ local, project: () => project, warn: (m) => warnings.push(m) });
    expect(await p.load()).toEqual(layout("local"));
    expect(warnings).toHaveLength(1);
  });

  it("프로젝트에 쓰지 못해도 localStorage 에는 남고 경고는 한 번만", async () => {
    const backend = new MemoryBackend({ "game.json": "{}" });
    backend.writeText = async () => {
      throw new Error("403 forbidden");
    };
    const project = new Project(backend);
    await project.open("memory://p");
    const warnings: string[] = [];
    const local = memoryStorage();
    const p = new LayoutPersistence({ local, project: () => project, warn: (m) => warnings.push(m) });
    await p.save(layout("a"));
    await p.save(layout("b"));
    expect(warnings).toHaveLength(1);
    expect(JSON.parse(local.data.get(LAYOUT_STORAGE_KEY)!)).toEqual(layout("b"));
  });
});
