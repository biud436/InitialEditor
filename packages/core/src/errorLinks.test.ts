import { describe, expect, it } from "vitest";
import { classifyEngineLine, isScriptErrorLine, parseErrorLinks, parseHotReloadCount } from "./errorLinks";

// 아래 줄들은 엔진을 헤드리스로 돌려 받아 적은 것이다 (errorLinks.ts 머리 주석).
describe("parseErrorLinks", () => {
  it("Lua 오류 메시지의 파일:줄: 을 찾는다", () => {
    const line = "scripts/lua/games/flappy.lua:12: attempt to index a nil value";
    expect(parseErrorLinks(line)).toEqual([{ path: "scripts/lua/games/flappy.lua", line: 12, start: 0, end: "scripts/lua/games/flappy.lua:12".length }]);
  });

  it("PANIC 줄 안의 ./scripts 경로를 찾고 앞의 ./ 를 뗀다", () => {
    const line = "PANIC: unprotected error in call to Lua API (./scripts/lua/main.lua:3: attempt to index a nil value (local 't'))";
    const links = parseErrorLinks(line);
    expect(links).toHaveLength(1);
    expect(links[0].path).toBe("scripts/lua/main.lua");
    expect(links[0].line).toBe(3);
    expect(line.slice(links[0].start, links[0].end)).toBe("./scripts/lua/main.lua:3");
  });

  it('[string "경로"] 청크는 경로일 때만 링크다', () => {
    const line = '[string "scripts/lua/hot.lua"]:3: unexpected symbol near \'=\'';
    const links = parseErrorLinks(line);
    expect(links).toHaveLength(1);
    expect(links[0]).toMatchObject({ path: "scripts/lua/hot.lua", line: 3, start: 0 });
    expect(line.slice(links[0].start, links[0].end)).toBe('[string "scripts/lua/hot.lua"]:3');
    expect(parseErrorLinks('[string "print(\'x\')"]:1: attempt to call a nil value')).toEqual([]);
  });

  it("Ruby 예외 메시지 줄 (in 메서드) 을 찾는다", () => {
    const line = "scripts/ruby/main.rb:2:in boom: undefined method 'bar' for NilClass (NoMethodError)";
    expect(parseErrorLinks(line)).toEqual([{ path: "scripts/ruby/main.rb", line: 2, start: 0, end: "scripts/ruby/main.rb:2".length }]);
  });

  it("Ruby 백트레이스 줄 (탭과 [n] 접두, 따옴표 있는 것도) 을 찾는다", () => {
    const withIndex = "\t[1] scripts/ruby/main.rb:8:in update";
    const quoted = "\tscripts/ruby/x.rb:5:in 'foo'";
    const lastFrame = "\t[2] scripts/ruby/main.rb:11";
    expect(parseErrorLinks(withIndex)[0]).toMatchObject({ path: "scripts/ruby/main.rb", line: 8, start: 5 });
    expect(parseErrorLinks(quoted)[0]).toMatchObject({ path: "scripts/ruby/x.rb", line: 5, start: 1 });
    expect(parseErrorLinks(lastFrame)[0]).toMatchObject({ path: "scripts/ruby/main.rb", line: 11, end: lastFrame.length });
  });

  it("한글 메시지 뒤에도 그대로 된다", () => {
    const line = "scripts/lua/main.lua:7: 배열 인덱스가 nil 이다 (지역 변수 't')";
    expect(parseErrorLinks(line)).toMatchObject([{ path: "scripts/lua/main.lua", line: 7 }]);
  });

  it("Windows 역슬래시 경로는 / 로 정규화한다", () => {
    const line = ".\\scripts\\lua\\main.lua:12: attempt to call a nil value (global 'foo')";
    const links = parseErrorLinks(line);
    expect(links).toMatchObject([{ path: "scripts/lua/main.lua", line: 12, start: 0 }]);
    expect(line.slice(links[0].start, links[0].end)).toBe(".\\scripts\\lua\\main.lua:12");
  });

  it("열 번호가 있으면 column 에 담는다", () => {
    expect(parseErrorLinks("resources/scenes/title.json:4:12: unexpected token")).toMatchObject([{ path: "resources/scenes/title.json", line: 4, column: 12 }]);
    // 줄 번호 뒤의 콜론과 공백 다음 숫자는 열이 아니다
    const noColumn = parseErrorLinks("scripts/lua/main.lua:3: 4 apples");
    expect(noColumn).toMatchObject([{ line: 3 }]);
    expect("column" in noColumn[0]).toBe(false);
  });

  it("한 줄에 여럿이면 순서대로 전부", () => {
    const line = "scripts/lua/a.lua:1: x  scripts/lua/b.lua:2: y";
    expect(parseErrorLinks(line).map((l) => `${l.path}:${l.line}`)).toEqual(["scripts/lua/a.lua:1", "scripts/lua/b.lua:2"]);
  });

  it("프로젝트 밖 경로와 줄 번호 없는 경로는 링크가 아니다", () => {
    expect(parseErrorLinks("/Users/u/x.lua:3: boom")).toEqual([]);
    expect(parseErrorLinks("SetAppIcon: cannot load ./resources/icons/icon.png (Couldn't open ./resources/icons/icon.png: No such file or directory)")).toEqual([]);
    expect(parseErrorLinks("scripts/lua/main.lua:12abc")).toEqual([]);
    expect(parseErrorLinks("HotReload: reloaded with 3 files")).toEqual([]);
    expect(parseErrorLinks("")).toEqual([]);
  });
});

describe("classifyEngineLine", () => {
  it("오류로 보는 줄", () => {
    for (const line of [
      "PANIC: unprotected error in call to Lua API (./scripts/lua/main.lua:3: attempt to index a nil value (local 't'))",
      "scripts/lua/games/flappy.lua:12: attempt to index a nil value",
      "mruby: uncaught exception in update",
      "trace (most recent call last):",
      "\t[1] scripts/ruby/main.rb:8:in update",
      "scripts/ruby/main.rb:2:in boom: undefined method 'bar' for NilClass (NoMethodError)",
      "stack traceback:",
      "HotReload: reload failed — restart the app",
      "mruby: cannot open ./scripts/ruby/main.rb",
      "Error: 파일을 읽지 못했다",
      "fatal: C++ 예외 std::bad_alloc: std::bad_alloc",
    ]) {
      expect(classifyEngineLine(line), line).toBe("error");
    }
  });

  it("경고로 보는 줄", () => {
    expect(classifyEngineLine("warning: deprecated API Graphics.print")).toBe("warn");
    expect(classifyEngineLine("WARN: audio device missing")).toBe("warn");
    expect(classifyEngineLine("SetAppIcon: cannot load ./resources/icons/icon.png (Couldn't open ./resources/icons/icon.png: No such file or directory)")).toBe("warn");
    expect(classifyEngineLine("HotReload: cannot write scripts/lua/x.lua")).toBe("warn");
  });

  it("나머지는 정보", () => {
    expect(classifyEngineLine("HotReload: reloaded with 3 files")).toBe("info");
    expect(classifyEngineLine("HotReload: listening on 127.0.0.1:5959 (tools/hmr_push.py)")).toBe("info");
    expect(classifyEngineLine("샘플 프로젝트 시작")).toBe("info");
    expect(classifyEngineLine("")).toBe("info");
  });
});

describe("isScriptErrorLine", () => {
  it("스크립트가 멈췄다고 알리는 첫 줄 (엔진이 찍는 형식). 모두 콘솔에서도 오류 줄이다", () => {
    for (const line of [
      "Lua error in update: ./scripts/lua/main.lua:23: boom in update",
      "Lua error in init: (no message)",
      "Lua error in scripts/lua/main.lua: ./scripts/lua/main.lua:1: unexpected symbol near '='",
      "mruby: uncaught exception in update",
      "PANIC: unprotected error in call to Lua API (./scripts/lua/main.lua:3: attempt to index a nil value (local 't'))",
      "mruby: this build has no mruby. Install it (brew install mruby) and run cmake again,",
      "script restart failed: std::runtime_error: boom",
    ]) {
      expect(isScriptErrorLine(line), line).toBe(true);
      expect(classifyEngineLine(line), line).toBe("error");
    }
  });

  it("역추적 줄, 자원 줄, 리로드 알림, 게임이 찍은 글은 아니다", () => {
    for (const line of [
      "trace (most recent call last):",
      "\t[1] scripts/ruby/main.rb:8:in update",
      "scripts/ruby/main.rb:2:in boom: undefined method 'bar' for NilClass (NoMethodError)",
      "mruby: cannot open ./scripts/ruby/main.rb",
      "HotReload: reload failed (web, script error), scripts stopped until the next reload",
      "Error: 파일을 읽지 못했다",
      "errors: 0, Lua error in update 는 없었다",
      "INFO: Lua error in update",
      "",
    ]) {
      expect(isScriptErrorLine(line), line).toBe(false);
    }
  });
});

describe("parseHotReloadCount", () => {
  it("리로드 줄에서 파일 수를 읽는다", () => {
    expect(parseHotReloadCount("HotReload: reloaded with 3 files")).toBe(3);
    expect(parseHotReloadCount("INFO: HotReload: reloaded with 1 files")).toBe(1);
    expect(parseHotReloadCount("HotReload: listening on 127.0.0.1:5959")).toBeNull();
  });
});
