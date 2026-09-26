// 폴링 감시의 규칙: 추적 범위, 새 폴더, 지운 폴더, 따로 추적하는 파일, 내가 한 변경(hold, note, 해시), 타이머.

import type { ChangeEvent } from "@initial-editor/core";
import { afterEach, describe, expect, it, vi } from "vitest";
import { hashBytes } from "../src/hash";
import { ChangePoller, DIR_STAMP, type PollSource, type Stamp, type StampedEntry } from "../src/poller";

const enc = (s: string) => new TextEncoder().encode(s);

/** 경로 → 내용. 폴더는 따로 적는다. listDir 앞에 끼어들 수 있다 */
class MapSource implements PollSource {
  files = new Map<string, { text: string; mtime: number }>();
  dirs = new Set<string>([""]);
  clock = 1000;
  beforeList: ((rel: string) => Promise<void> | void) | null = null;

  write(path: string, text: string): void {
    const parts = path.split("/");
    for (let i = 1; i < parts.length; i++) this.dirs.add(parts.slice(0, i).join("/"));
    this.files.set(path, { text, mtime: ++this.clock });
  }

  remove(path: string): void {
    this.files.delete(path);
    for (const f of [...this.files.keys()]) if (f.startsWith(path + "/")) this.files.delete(f);
    for (const d of [...this.dirs]) if (d === path || d.startsWith(path + "/")) this.dirs.delete(d);
  }

  stamp(path: string): Stamp {
    const f = this.files.get(path)!;
    return { kind: "file", size: enc(f.text).byteLength, mtime: f.mtime };
  }

  entries(rel: string): StampedEntry[] {
    const prefix = rel === "" ? "" : rel + "/";
    const out: StampedEntry[] = [];
    for (const d of this.dirs) if (d !== rel && d.startsWith(prefix) && !d.slice(prefix.length).includes("/")) out.push({ name: d.slice(prefix.length), stamp: DIR_STAMP });
    for (const f of this.files.keys()) if (f.startsWith(prefix) && !f.slice(prefix.length).includes("/")) out.push({ name: f.slice(prefix.length), stamp: this.stamp(f) });
    return out;
  }

  async listDir(rel: string): Promise<StampedEntry[] | null> {
    await this.beforeList?.(rel);
    return this.dirs.has(rel) ? this.entries(rel) : null;
  }

  async statFile(rel: string): Promise<Stamp | null> {
    return this.files.has(rel) ? this.stamp(rel) : null;
  }

  async hashFile(rel: string): Promise<string | null> {
    const f = this.files.get(rel);
    return f ? hashBytes(enc(f.text)) : null;
  }
}

function setup(now?: () => number) {
  const source = new MapSource();
  const events: ChangeEvent[] = [];
  const poller = new ChangePoller(source, (e) => events.push(e), { intervalMs: 1500, selfWindowMs: 3000, now });
  const take = () => events.splice(0).map((e) => `${e.kind}:${e.path}:${e.origin}`);
  return { source, poller, take };
}

afterEach(() => {
  vi.useRealTimers();
});

describe("ChangePoller", () => {
  it("추적하는 폴더 안의 만들기, 고치기, 지우기를 external 로 알린다", async () => {
    const { source, poller, take } = setup();
    source.write("a.lua", "1");
    source.write("b.lua", "2");
    poller.trackDir("", source.entries(""));
    await poller.poll();
    expect(take()).toEqual([]);

    source.write("a.lua", "11");
    source.write("c.lua", "3");
    source.remove("b.lua");
    await poller.poll();
    expect(take().sort()).toEqual(["create:c.lua:external", "delete:b.lua:external", "modify:a.lua:external"]);
    await poller.poll();
    expect(take()).toEqual([]);
  });

  it("크기가 같아도 수정 시각이 바뀌면 modify", async () => {
    const { source, poller, take } = setup();
    source.write("a.lua", "1");
    poller.trackDir("", source.entries(""));
    source.write("a.lua", "2");
    await poller.poll();
    expect(take()).toEqual(["modify:a.lua:external"]);
  });

  it("목록을 읽지 않은 폴더는 보지 않는다. 이미 추적 중인 폴더는 trackDir 이 덮어쓰지 않는다", async () => {
    const { source, poller, take } = setup();
    source.write("scripts/lua/main.lua", "x");
    poller.trackDir("", source.entries(""));
    source.write("scripts/lua/main.lua", "xx");
    await poller.poll();
    expect(take()).toEqual([]);

    poller.trackDir("scripts/lua", source.entries("scripts/lua"));
    source.write("scripts/lua/main.lua", "xxx");
    // 알리기 전에 다시 목록을 읽어도 (트리 새로 고침) 변경을 삼키지 않는다
    poller.trackDir("scripts/lua", source.entries("scripts/lua"));
    await poller.poll();
    expect(take()).toEqual(["modify:scripts/lua/main.lua:external"]);
  });

  it("추적하는 폴더에 새 폴더가 생기면 그 안까지 알리고 추적한다", async () => {
    const { source, poller, take } = setup();
    source.write("game.json", "{}");
    poller.trackDir("", source.entries(""));
    source.write("scripts/lua/main.lua", "a");
    source.write("scripts/readme.txt", "b");
    await poller.poll();
    expect(take().sort()).toEqual([
      "create:scripts/lua/main.lua:external",
      "create:scripts/lua:external",
      "create:scripts/readme.txt:external",
      "create:scripts:external",
    ]);
    expect(poller.isTrackedDir("scripts/lua")).toBe(true);
    source.write("scripts/lua/main.lua", "ab");
    await poller.poll();
    expect(take()).toEqual(["modify:scripts/lua/main.lua:external"]);
  });

  it("추적하던 폴더가 지워지면 폴더와 알던 파일을 지움으로 알리고 추적을 멈춘다", async () => {
    const { source, poller, take } = setup();
    source.write("maps/a.json", "1");
    source.write("maps/b.json", "2");
    poller.trackDir("", source.entries(""));
    poller.trackDir("maps", source.entries("maps"));
    source.remove("maps");
    await poller.poll();
    expect(take().sort()).toEqual(["delete:maps/a.json:external", "delete:maps/b.json:external", "delete:maps:external"]);
    expect(poller.isTrackedDir("maps")).toBe(false);
  });

  it("부모를 추적하지 않는 파일도 읽었으면 따로 본다", async () => {
    const { source, poller, take } = setup();
    source.write("resources/maps/forest.json", "1");
    poller.trackFile("resources/maps/forest.json", source.stamp("resources/maps/forest.json"));
    source.write("resources/maps/forest.json", "22");
    await poller.poll();
    expect(take()).toEqual(["modify:resources/maps/forest.json:external"]);
    source.remove("resources/maps/forest.json");
    await poller.poll();
    expect(take()).toEqual(["delete:resources/maps/forest.json:external"]);
    source.write("resources/maps/forest.json", "3");
    await poller.poll();
    expect(take()).toEqual(["create:resources/maps/forest.json:external"]);
  });

  it("내가 쓴 것: noteWrite 로 도장을 고치면 훑기가 알리지 않는다", async () => {
    const { source, poller, take } = setup();
    source.write("a.lua", "1");
    poller.trackDir("", source.entries(""));
    const release = poller.hold("a.lua");
    source.write("a.lua", "mine");
    await poller.poll();
    expect(take()).toEqual([]);
    poller.noteWrite("a.lua", source.stamp("a.lua"), hashBytes(enc("mine")));
    release();
    await poller.poll();
    expect(take()).toEqual([]);
  });

  it("훑는 사이에 내가 고친 경로는 건너뛴다", async () => {
    const { source, poller, take } = setup();
    source.write("a.lua", "1");
    poller.trackDir("", source.entries(""));
    source.beforeList = () => {
      source.beforeList = null;
      source.write("a.lua", "mine");
      source.write("b.lua", "new");
      poller.noteWrite("a.lua", source.stamp("a.lua"), hashBytes(enc("mine")));
      poller.noteWrite("b.lua", source.stamp("b.lua"), hashBytes(enc("new")));
    };
    await poller.poll();
    expect(take()).toEqual([]);
    await poller.poll();
    expect(take()).toEqual([]);
  });

  it("도장을 못 읽은 쓰기는 3초 안에 해시가 같으면 self, 다르거나 지나면 external", async () => {
    let now = 0;
    const { source, poller, take } = setup(() => now);
    source.write("a.lua", "1");
    poller.trackDir("", source.entries(""));
    source.write("a.lua", "mine");
    poller.noteWrite("a.lua", null, hashBytes(enc("mine")));
    await poller.poll();
    expect(take()).toEqual(["create:a.lua:self"]);

    source.write("a.lua", "mine2");
    poller.noteWrite("a.lua", null, hashBytes(enc("mine2")));
    source.write("a.lua", "someone else");
    await poller.poll();
    expect(take()).toEqual(["create:a.lua:external"]);

    source.write("a.lua", "late");
    poller.noteWrite("a.lua", null, hashBytes(enc("late")));
    now = 3001;
    await poller.poll();
    expect(take()).toEqual(["create:a.lua:external"]);
  });

  it("noteDelete 와 noteMkdir 는 알리지 않고, 만든 폴더는 부모를 추적하면 추적한다", async () => {
    const { source, poller, take } = setup();
    source.write("old/x.lua", "1");
    poller.trackDir("", source.entries(""));
    poller.trackDir("old", source.entries("old"));
    source.remove("old");
    poller.noteDelete("old");
    source.dirs.add("fresh");
    poller.noteMkdir("fresh", true);
    await poller.poll();
    expect(take()).toEqual([]);
    expect(poller.isTrackedDir("old")).toBe(false);
    expect(poller.isTrackedDir("fresh")).toBe(true);
    source.write("fresh/y.lua", "2");
    await poller.poll();
    expect(take()).toEqual(["create:fresh/y.lua:external"]);
  });

  it("reset 은 진행 중인 훑기의 결과를 버린다", async () => {
    const { source, poller, take } = setup();
    source.write("a.lua", "1");
    poller.trackDir("", source.entries(""));
    source.write("a.lua", "2");
    source.beforeList = () => poller.reset();
    await poller.poll();
    expect(take()).toEqual([]);
  });

  it("start 는 간격마다 훑고 stop 은 멈춘다. 훑기는 겹치지 않는다", async () => {
    vi.useFakeTimers();
    const { source, poller, take } = setup();
    source.write("a.lua", "1");
    poller.trackDir("", source.entries(""));
    let lists = 0;
    source.beforeList = () => void lists++;
    poller.start();
    source.write("a.lua", "2");
    await vi.advanceTimersByTimeAsync(1400);
    expect(take()).toEqual([]);
    await vi.advanceTimersByTimeAsync(200);
    expect(take()).toEqual(["modify:a.lua:external"]);
    await vi.advanceTimersByTimeAsync(1500 * 3);
    expect(lists).toBe(4);
    poller.stop();
    source.write("a.lua", "3");
    await vi.advanceTimersByTimeAsync(1500 * 3);
    expect(lists).toBe(4);
    expect(take()).toEqual([]);
  });
});
