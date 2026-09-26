import { chmodSync, existsSync, mkdtempSync, readFileSync, realpathSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { engineEnv, engineLayout, errorLines, missingFiles, parsePlacement, probeFeatures, runEngine, screenshotPath, stageProblemLines } from "./engine";

let dir = "";

beforeAll(() => {
  dir = mkdtempSync(path.join(tmpdir(), "initial-editor-engine-unit-"));
});

afterAll(() => {
  if (dir) rmSync(dir, { recursive: true, force: true });
});

/** 가짜 엔진: 환경 변수 몇 개를 찍고, 스크린샷 자리에 파일을 쓰고, FAKE_EXIT로 끝난다 */
const FAKE_ENGINE = `
const fs = require("node:fs");
const shot = process.env.INITIAL2D_SCREENSHOT;
if (shot) fs.writeFileSync(shot.replace("%04ld", String(process.env.INITIAL2D_SCREENSHOT_FRAME).padStart(4, "0")), "BM");
console.log(["script=" + process.env.INITIAL2D_SCRIPT, "at=" + process.env.INITIAL2D_ALDEBARAN_AT, "hmr=" + process.env.INITIAL2D_HMR, "video=" + process.env.SDL_VIDEODRIVER, "cwd=" + process.cwd()].join(" "));
console.error("stderr line");
if (process.env.FAKE_HANG) setTimeout(() => {}, 60000);
else process.exit(Number(process.env.FAKE_EXIT || 0));
`;

describe("engineLayout과 missingFiles", () => {
  it("실행 파일과 브리지 서버의 자리", () => {
    expect(engineLayout("/e", "darwin")).toEqual({ dir: "/e", exe: path.join("/e", "build", "Initial2D"), bridgeServer: path.join("/e", "tools", "bridge", "server.js") });
    expect(engineLayout("/e", "win32").exe).toBe(path.join("/e", "build", "Initial2D.exe"));
  });

  it("없는 것만 돌려준다", () => {
    const here = path.join(dir, "here.txt");
    writeFileSync(here, "x");
    expect(missingFiles([here, path.join(dir, "nope")])).toEqual([path.join(dir, "nope")]);
  });
});

describe("engineEnv", () => {
  const base = { PATH: "/bin", HOME: "/home/u", INITIAL2D_HMR: "1", INITIAL2D_ALDEBARAN_STOP: "title", INITIAL2D_SCRIPT: "mruby", EMPTY: undefined };

  it("셸의 INITIAL2D_* 를 지우고 SDL 더미, 언어, 실행 변수, 유한 실행과 덤프 변수를 둔다", () => {
    const env = engineEnv({ baseEnv: base, script: "lua", playEnv: { INITIAL2D_SCENE: "aldebaran", INITIAL2D_ALDEBARAN_AT: "1966" }, exitAfter: 300, shot: { dir: "/tmp/s", prefix: "forest-lua", frame: 240 } });
    expect(env).toEqual({
      PATH: "/bin",
      HOME: "/home/u",
      SDL_VIDEODRIVER: "dummy",
      SDL_AUDIODRIVER: "dummy",
      INITIAL2D_SCRIPT: "lua",
      INITIAL2D_SCENE: "aldebaran",
      INITIAL2D_ALDEBARAN_AT: "1966",
      INITIAL2D_EXIT_AFTER: "300",
      INITIAL2D_SCREENSHOT: path.join("/tmp/s", "forest-lua_%04ld.bmp"),
      INITIAL2D_SCREENSHOT_FRAME: "240",
    });
  });

  it("실행 변수는 언어를 덮을 수 있고(러너와 같다), 유한 실행 변수는 실행 변수가 덮지 못한다", () => {
    const env = engineEnv({ baseEnv: {}, script: "lua", playEnv: { INITIAL2D_SCRIPT: "mruby", INITIAL2D_EXIT_AFTER: "999999" }, exitAfter: 30 });
    expect(env.INITIAL2D_SCRIPT).toBe("mruby");
    expect(env.INITIAL2D_EXIT_AFTER).toBe("30");
    expect(env.INITIAL2D_SCREENSHOT).toBeUndefined();
  });

  it("스크린샷 파일 이름은 프레임을 네 자리로 채운다", () => {
    expect(screenshotPath("/tmp/s", "forest-lua", 240)).toBe(path.join("/tmp/s", "forest-lua_0240.bmp"));
    expect(screenshotPath("/tmp/s", "x", 12345)).toBe(path.join("/tmp/s", "x_12345.bmp"));
  });
});

describe("runEngine", () => {
  function fake(): string {
    const p = path.join(dir, "fake-engine.cjs");
    writeFileSync(p, FAKE_ENGINE);
    return p;
  }

  it("cwd와 환경 변수로 띄우고 종료 코드, 합친 로그, 스크린샷 자리를 돌려준다", async () => {
    const cwd = mkdtempSync(path.join(dir, "cwd-"));
    const run = await runEngine({
      exe: process.execPath,
      args: [fake()],
      cwd,
      script: "mruby",
      playEnv: { INITIAL2D_ALDEBARAN_AT: "1966" },
      exitAfter: 10,
      shot: { dir, prefix: "shot-a", frame: 240 },
      baseEnv: { PATH: process.env.PATH, INITIAL2D_HMR: "1" },
    });
    expect(run.code).toBe(0);
    expect(run.timedOut).toBe(false);
    expect(run.log).toContain(`script=mruby at=1966 hmr=undefined video=dummy cwd=${realpathSync(cwd)}`);
    expect(run.log).toContain("stderr line");
    expect(run.shot).toBe(path.join(dir, "shot-a_0240.bmp"));
    expect(readFileSync(run.shot!, "latin1")).toBe("BM");
  });

  it("0이 아닌 종료 코드를 그대로 돌려준다", async () => {
    const run = await runEngine({ exe: process.execPath, args: [fake()], cwd: dir, script: "lua", playEnv: {}, exitAfter: 10, baseEnv: { FAKE_EXIT: "3" } });
    expect(run.code).toBe(3);
    expect(run.shot).toBeNull();
  });

  it("시간이 지나면 죽이고 timedOut", async () => {
    const run = await runEngine({ exe: process.execPath, args: [fake()], cwd: dir, script: "lua", playEnv: {}, exitAfter: 10, baseEnv: { FAKE_HANG: "1" }, timeoutMs: 300 });
    expect(run.timedOut).toBe(true);
    expect(run.signal).toBe("SIGKILL");
  });

  it("실행 파일이 없으면 거부한다", async () => {
    await expect(runEngine({ exe: path.join(dir, "no-such-engine"), cwd: dir, script: "lua", playEnv: {}, exitAfter: 10 })).rejects.toThrow(/ENOENT/);
  });
});

describe.skipIf(process.platform === "win32")("probeFeatures", () => {
  function script(name: string, body: string): string {
    const p = path.join(dir, name);
    writeFileSync(p, `#!/bin/sh\n${body}\n`);
    chmodSync(p, 0o755);
    return p;
  }

  it("--features의 답을 집합으로", () => {
    const exe = script("features-ok.sh", 'if [ "$1" = "--features" ]; then echo "lua mruby"; else exit 9; fi');
    expect([...probeFeatures(exe)]).toEqual(["lua", "mruby"]);
  });

  it("실패하거나 없으면 빈 집합", () => {
    expect(probeFeatures(script("features-fail.sh", "exit 1")).size).toBe(0);
    expect(existsSync(path.join(dir, "missing"))).toBe(false);
    expect(probeFeatures(path.join(dir, "missing")).size).toBe(0);
  });
});

describe("로그 읽기", () => {
  // 엔진이 실제로 찍는 줄들 (Lua와 mruby가 같다)
  const CLEAN = ["생성되었습니다.", "/Users/u/Initial2D/build/config.setting", "libpng warning: iCCP: known incorrect sRGB profile"].join("\n");

  it("오류 줄: iCCP 경고를 빼고 error, panic, uncaught exception", () => {
    expect(errorLines(CLEAN)).toEqual([]);
    const bad = [CLEAN, "Lua error in scripts/lua/main.lua: boom", "PANIC: unprotected error in call to Lua API", "mruby: uncaught exception in update", "평범한 줄"].join("\n");
    expect(errorLines(bad)).toEqual(["Lua error in scripts/lua/main.lua: boom", "PANIC: unprotected error in call to Lua API", "mruby: uncaught exception in update"]);
  });

  it("배치 줄: 그 자리에 선 꼴(y 포함)과 옮긴 꼴, 첫 줄만", () => {
    // 엔진(game.lua, game.rb)의 string.format과 format("%g")가 찍는 그대로
    expect(parsePlacement(`${CLEAN}\n알데바란: 시작 x 1966 (y 304)\n`)).toEqual({ line: "알데바란: 시작 x 1966 (y 304)", requested: 1966, placed: 1966, y: 304 });
    expect(parsePlacement(`${CLEAN}\n알데바란: 시작 x 2120 → 2104 (구덩이 위라 가까운 땅으로)\n`)).toEqual({
      line: "알데바란: 시작 x 2120 → 2104 (구덩이 위라 가까운 땅으로)",
      requested: 2120,
      placed: 2104,
      y: null,
    });
    expect(parsePlacement("알데바란: 시작 x 1966 (y 303.5)\r\n알데바란: 시작 x 5 → 6")).toEqual({ line: "알데바란: 시작 x 1966 (y 303.5)", requested: 1966, placed: 1966, y: 303.5 });
    expect(parsePlacement("알데바란: 시작 x 12.5 → 16 (구덩이)")).toMatchObject({ requested: 12.5, placed: 16, y: null });
    expect(parsePlacement("알데바란: 시작 x 40")).toEqual({ line: "알데바란: 시작 x 40", requested: 40, placed: 40, y: null });
    expect(parsePlacement(CLEAN)).toBeNull();
    expect(parsePlacement("알데바란: 시작 지점이 없다")).toBeNull();
  });

  it("배치 줄이 아닌 알데바란 줄은 스테이지 문제다", () => {
    const log = [CLEAN, "알데바란: 시작 x 2120 → 2104 (구덩이 위라 가까운 땅으로)", "알데바란: 시작 x 1966 (y 304)", "알데바란: 모르는 스테이지 'nope'"].join("\n");
    expect(stageProblemLines(log)).toEqual(["알데바란: 모르는 스테이지 'nope'"]);
    expect(stageProblemLines(CLEAN)).toEqual([]);
  });
});
