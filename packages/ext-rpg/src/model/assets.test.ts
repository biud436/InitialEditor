import { describe, expect, it } from "vitest";
import { fixtureGame, fixtureItems, fixtureMap, fixtureSchema } from "../testing/fixtures";
import { assetIndex, characterDrawPos, charsetFrame, faceRect, isRtpPath, resolveAssetFile } from "./assets";
import { refSuggestions, startStateSuggestions, usedStateNames } from "./refs";

const schema = fixtureSchema();

describe("외형과 얼굴 (엔진 Assets.pick 과 specs.lua)", () => {
  it("논리 이름은 후보 중 있는 첫 파일, 다 없으면 마지막 후보, RTP 를 끄면 RTP 를 건너뛴다", () => {
    const withRtp = (p: string) => p === "resources/rtp/CharSet/People1.png" || p === "resources/charsets/placeholder.png";
    const placeholderOnly = (p: string) => p === "resources/charsets/placeholder.png";
    expect(resolveAssetFile(schema, "charset", { set: "npc", index: 2 }, withRtp)).toBe("resources/rtp/CharSet/People1.png");
    expect(resolveAssetFile(schema, "charset", { set: "npc", index: 2 }, withRtp, { rtp: false })).toBe("resources/charsets/placeholder.png");
    expect(resolveAssetFile(schema, "charset", { set: "npc" }, placeholderOnly)).toBe("resources/charsets/placeholder.png");
    expect(resolveAssetFile(schema, "face", { set: "npc" }, () => false)).toBe("resources/faces/placeholder.png");
    expect(resolveAssetFile(schema, "charset", { file: "./resources/charsets/hero.png", index: 1 }, () => false)).toBe("resources/charsets/hero.png");
    expect(resolveAssetFile(schema, "face", { set: "player" }, () => true)).toBeNull();
    expect(resolveAssetFile(schema, "charset", "npc", () => true)).toBeNull();
    expect(isRtpPath("./resources/rtp/FaceSet/People1.png")).toBe(true);
    expect(isRtpPath("resources/faces/placeholder.png")).toBe(false);
  });

  it("CharSet 의 서 있는 프레임: 8명(4열 2행), 한 명 72x128, standPattern 열, 방향 행", () => {
    expect(charsetFrame(schema, 0)).toEqual({ x: 24, y: 64, w: 24, h: 32 });
    expect(charsetFrame(schema, 2, "up")).toEqual({ x: 2 * 72 + 24, y: 0, w: 24, h: 32 });
    expect(charsetFrame(schema, 5, "left")).toEqual({ x: 72 + 24, y: 128 + 96, w: 24, h: 32 });
    expect(charsetFrame(schema, 7, "nowhere")).toEqual({ x: 3 * 72 + 24, y: 128 + 64, w: 24, h: 32 });
    expect(charsetFrame(schema, 99).x).toBe(3 * 72 + 24);
    expect(assetIndex({ set: "npc", index: 6 })).toBe(6);
    expect(assetIndex({ set: "npc" })).toBe(0);
    expect(assetIndex({ index: -1 })).toBe(0);
  });

  it("FaceSet 칸과 발 기준 그리기 자리 (character.lua 의 pixelPos)", () => {
    expect(faceRect(schema, 0)).toEqual({ x: 0, y: 0, w: 48, h: 48 });
    expect(faceRect(schema, 6)).toEqual({ x: 96, y: 48, w: 48, h: 48 });
    expect(faceRect(schema, 15)).toEqual({ x: 144, y: 144, w: 48, h: 48 });
    // 16x16 칸에 24x32 프레임: 가로는 가운데(-4), 발이 칸 아래 변(윗 칸으로 16 올라간다)
    expect(characterDrawPos(schema, 16, 16, 2, 3)).toEqual({ x: 28, y: 32 });
  });
});

describe("참조 칸의 제안", () => {
  const port = fixtureMap("port_town").map.events!;
  const inn = fixtureMap("inn").map.events!;
  const src = { schema, game: fixtureGame(), items: fixtureItems(), events: port, projectEvents: [port, inn] };

  it("맵, 아이템(순서대로 이름과), 이 맵의 이벤트와 player", () => {
    expect(refSuggestions("map", src).map((s) => s.value)).toEqual(["port_town", "inn", "village", "room"]);
    expect(refSuggestions("item", src)).toEqual([
      { value: "warehouse_key", detail: "창고 열쇠" },
      { value: "lamp_oil", detail: "등유 한 통" },
      { value: "silver", detail: "은화" },
      { value: "shell", detail: "조개 목걸이" },
    ]);
    const chars = refSuggestions("character", src);
    expect(chars.map((s) => s.value)).toContain("captain");
    expect(chars.find((s) => s.value === "crates")!.detail).toBe("외형 없음");
    expect(chars[chars.length - 1]).toEqual({ value: "player", detail: "플레이어" });
    expect(refSuggestions("map", { schema })).toEqual([]);
  });

  it("깃발과 변수는 이 프로젝트의 맵 파일들에서 쓰인 이름 (조건 안까지)", () => {
    const names = usedStateNames(schema, [port, inn]);
    expect(names.flags).toEqual(expect.arrayContaining(["arrived", "heardWarehouse", "booked", "lampReady", "gaveKey"]));
    expect(new Set(names.flags).size).toBe(names.flags.length);
    const flags = refSuggestions("flag", src).map((s) => s.value);
    expect(flags).toEqual(names.flags);
    const own = usedStateNames(schema, [[{ id: "a", x: 0, y: 0, commands: [{ code: "setVar", key: "coins", value: 1 }, { code: "if", cond: { var: "coins", op: ">", value: 0 }, thenDo: [{ code: "setFlag", key: "rich" }] }, { code: "if", cond: { item: "shell", flag: "ignored" } }] }]]);
    expect(own).toEqual({ flags: ["rich"], vars: ["coins"] });
  });

  it("시작 상태 칸의 제안: 깃발, 변수=, item:<id>=1", () => {
    const s = startStateSuggestions({ schema, items: fixtureItems(), events: [{ id: "a", x: 0, y: 0, commands: [{ code: "setFlag", key: "met" }, { code: "setVar", key: "coins" }] }] });
    expect(s.map((x) => x.value)).toEqual(["met", "coins=", "item:warehouse_key=1", "item:lamp_oil=1", "item:silver=1", "item:shell=1"]);
  });
});
