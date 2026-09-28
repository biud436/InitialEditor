import { describe, expect, it } from "vitest";
import { entryScript, joinPath, parsePlan, projectRoot, runLogName } from "./plan";

const base = {
  version: 1,
  workDir: "/tmp/i2d-selftest",
  report: "/tmp/i2d-selftest/report.json",
  totalTimeoutMs: 600000,
  projects: [
    {
      id: "flappy-lua",
      template: "flappy",
      language: "lua",
      runs: [{ mode: "process", expectEngineSource: "bundled", check: "flappy", env: { INITIAL2D_AUTOPLAY: "1" }, timeoutMs: 90000 }],
    },
  ],
};

describe("자가 검사 계획", () => {
  it("모양을 읽고 기본값을 채운다", () => {
    const plan = parsePlan(base);
    expect(plan.showWindow).toBe(false);
    const p = plan.projects[0];
    expect(p).toMatchObject({ id: "flappy-lua", template: "flappy", language: "lua", root: null, entry: "scripts/lua/main.lua", edit: null, openMap: null, probe: null });
    expect(p.runs[0]).toEqual({
      mode: "process",
      optional: false,
      expectEngineSource: "bundled",
      expectFallback: null,
      check: "flappy",
      env: { INITIAL2D_AUTOPLAY: "1" },
      scene: null,
      timeoutMs: 90000,
      mapCapture: null,
      play: null,
    });
    expect(projectRoot(plan, p)).toBe("/tmp/i2d-selftest/flappy-lua");
  });

  it("Ruby 는 main.rb, root 를 준 프로젝트는 그 폴더를 연다", () => {
    const plan = parsePlan({
      ...base,
      showWindow: true,
      projects: [
        { ...base.projects[0], id: "ruby", language: "mruby" },
        {
          id: "forest",
          root: "/tmp/fixtures/forest",
          openMap: "resources/maps/aldebaran_forest.json",
          runs: [{ mode: "process", check: "mapFrame", timeoutMs: 60000, mapCapture: { map: "resources/maps/aldebaran_forest.json", width: 384, height: 448, placement: "^알데바란: 시작 x (\\d+)" } }],
        },
      ],
    });
    expect(plan.showWindow).toBe(true);
    expect(plan.projects[0].entry).toBe(entryScript("mruby"));
    expect(plan.projects[0].entry).toBe("scripts/ruby/main.rb");
    expect(projectRoot(plan, plan.projects[1])).toBe("/tmp/fixtures/forest");
    expect(plan.projects[1].runs[0].mapCapture).toMatchObject({ width: 384, height: 448 });
  });

  it("확장의 탐침(probe)과 확장의 실행 요청(play)", () => {
    const map = "resources/maps/port_town.json";
    const plan = parsePlan({
      ...base,
      projects: [
        {
          id: "rpg-port",
          root: "/tmp/fixtures/engine",
          probe: { extension: "rpg", map },
          runs: [
            { mode: "process", check: "eventFront", timeoutMs: 60000, play: { extension: "rpg", map, args: { event: "fishmonger" } } },
            { mode: "process", check: "eventProbe", timeoutMs: 60000, play: { extension: "rpg", map } },
          ],
        },
      ],
    });
    const p = plan.projects[0];
    expect(p.probe).toEqual({ extension: "rpg", map });
    expect(p.runs[0].play).toEqual({ extension: "rpg", map, args: { event: "fishmonger" } });
    expect(p.runs[1].play).toEqual({ extension: "rpg", map, args: {} });
  });

  it("틀린 계획은 이유와 함께 거절한다", () => {
    const run = base.projects[0].runs[0];
    const cases: Array<[unknown, RegExp]> = [
      [null, /객체/],
      [{ ...base, version: 2 }, /version/],
      [{ ...base, projects: [] }, /projects/],
      [{ ...base, workDir: "" }, /workDir/],
      [{ ...base, projects: [{ id: "x", runs: [run] }] }, /template 이나 root/],
      [{ ...base, projects: [base.projects[0], base.projects[0]] }, /프로젝트 id 중복/],
      [{ ...base, projects: [{ ...base.projects[0], template: "rpg" }] }, /template/],
      [{ ...base, projects: [{ ...base.projects[0], runs: [] }] }, /runs/],
      [{ ...base, projects: [{ ...base.projects[0], runs: [{ ...run, mode: "web" }] }] }, /mode/],
      [{ ...base, projects: [{ ...base.projects[0], runs: [{ ...run, check: "mapFrame" }] }] }, /mapCapture/],
      [{ ...base, projects: [{ ...base.projects[0], runs: [{ ...run, env: { A: 1 } }] }] }, /env\.A/],
      [{ ...base, projects: [{ ...base.projects[0], runs: [{ ...run, timeoutMs: 5 }] }] }, /timeoutMs/],
      [{ ...base, projects: [{ ...base.projects[0], edit: { kind: "fill" } }] }, /paintTile/],
      [{ ...base, projects: [{ ...base.projects[0], runs: [{ ...run, check: "eventFront" }] }] }, /play/],
      [{ ...base, projects: [{ ...base.projects[0], runs: [{ ...run, check: "eventProbe", play: { extension: "rpg" } }] }] }, /play\.map/],
      [{ ...base, projects: [{ ...base.projects[0], runs: [{ ...run, play: { extension: "rpg", map: "m.json", args: [] } }] }] }, /play\.args/],
      [{ ...base, projects: [{ ...base.projects[0], probe: { map: "m.json" } }] }, /probe\.extension/],
    ];
    for (const [raw, pattern] of cases) expect(() => parsePlan(raw), String(pattern)).toThrow(pattern);
  });

  it("경로에 쓰인 구분자로 붙인다", () => {
    expect(joinPath("/tmp/run", "logs")).toBe("/tmp/run/logs");
    expect(joinPath("/tmp/run/", "logs")).toBe("/tmp/run/logs");
    expect(joinPath("C:\\Users\\a\\run", "logs")).toBe("C:\\Users\\a\\run\\logs");
    expect(runLogName("flappy-lua", 1)).toBe("flappy-lua-1.log");
    expect(runLogName("tilemap", 2, "map.bmp")).toBe("tilemap-2.map.bmp");
  });
});
