// 엔진 출력의 `파일:줄[:열]` 참조를 찾아 콘솔이 링크로 그리게 한다 (docs/plans/e1-scripting.md 마일스톤 3).
// 순수 함수이고 DOM 을 모른다. 엔진(Initial2D SDL2 빌드, 2026-09)에서 실제로 확인한 형식은 다음과 같다.
//
//   Lua   PANIC: unprotected error in call to Lua API (./scripts/lua/main.lua:3: attempt to index a nil value (local 't'))
//           src/lua_prot.cpp 의 lua_call 은 보호되지 않아(pcall 아님) 스크립트 오류가 곧 PANIC 이고 종료 코드는 134 다.
//           luaL_dofile 의 반환값을 보지 않으므로 문법 오류는 따로 찍히지 않고 "attempt to call a nil value" 로 나타난다.
//         scripts/lua/games/flappy.lua:12: attempt to index a nil value      error() 나 pcall 뒤 print 한 메시지
//         [string "scripts/lua/x.lua"]:3: unexpected symbol                 loadstring 계열. 청크 이름이 경로일 때만 링크
//         Lua error in update: ./scripts/lua/main.lua:23: boom              src/lua_prot.cpp Lua_ReportIfError (VM 만 멈춘다)
//   Ruby  mruby: uncaught exception in update                                src/mrb_prot.cpp ReportError
//         trace (most recent call last):                                     mrb_print_error 의 백트레이스
//         \t[1] scripts/ruby/main.rb:8:in update
//         \t[2] scripts/ruby/main.rb:11
//         scripts/ruby/main.rb:2:in boom: undefined method 'bar' for NilClass (NoMethodError)
//   HMR   HotReload: reloaded with 3 files                                   src/platform/sdl2/AppSDL2.cpp
//
// 경로는 scripts/ 나 resources/ 로 시작하는 것만 링크다 (프로젝트 루트 기준). 앞의 ./ 와 Windows 역슬래시를 받아들이고
// 결과 path 는 `/` 구분자의 정규화된 상대 경로다.

import type { LogLevel } from "./log";

export interface ErrorLink {
  /** 루트 기준 상대 경로 (`/` 구분자, 앞의 ./ 없음) */
  path: string;
  /** 1부터 */
  line: number;
  column?: number;
  /** 줄 안에서 링크로 그릴 문자 범위 [start, end) */
  start: number;
  end: number;
}

// 경로: 선택적 ./ 또는 .\ 뒤에 scripts 나 resources, 그 뒤 구분자와 공백이나 따옴표나 괄호나 콜론이 아닌 문자들
const PATH_SOURCE = String.raw`(?:\.[\/\\])?(?:scripts|resources)[\/\\][^\s:"'()\[\]]+`;
// 줄 번호 뒤에는 콜론, 공백, 닫는 괄호, 줄 끝만 온다 (main.lua:12abc 는 아니다)
const AFTER = String.raw`(?=[:\s)\]]|$)`;
const LINK_PATTERN = new RegExp(
  String.raw`\[string "(${PATH_SOURCE})"\]:(\d+)(?::(\d+))?${AFTER}|(${PATH_SOURCE}):(\d+)(?::(\d+))?${AFTER}`,
  "g",
);

function normalizeLinkPath(raw: string): string {
  return raw.replace(/\\/g, "/").replace(/^\.\//, "");
}

/** 줄 하나에서 링크 후보를 전부 찾는다. 없으면 빈 배열 */
export function parseErrorLinks(line: string): ErrorLink[] {
  const out: ErrorLink[] = [];
  LINK_PATTERN.lastIndex = 0;
  for (let m = LINK_PATTERN.exec(line); m !== null; m = LINK_PATTERN.exec(line)) {
    const [whole, chunkPath, chunkLine, chunkCol, path, lineText, colText] = m;
    const rawPath = chunkPath ?? path;
    const lineNo = Number(chunkLine ?? lineText);
    const colRaw = chunkCol ?? colText;
    if (!rawPath || !Number.isFinite(lineNo) || lineNo < 1) continue;
    const link: ErrorLink = { path: normalizeLinkPath(rawPath), line: lineNo, start: m.index, end: m.index + whole.length };
    if (colRaw !== undefined) link.column = Number(colRaw);
    out.push(link);
  }
  return out;
}

// 스크립트가 멈췄다고 알리는 첫 줄: Lua 오류(src/lua_prot.cpp), Ruby 예외(src/mrb_prot.cpp), 옛 엔진의 Lua PANIC,
// mruby 가 없는 빌드(src/ScriptRuntime.cpp), 재시작 중의 C++ 예외(같은 파일의 Script_Restart). 역추적 줄은 세지 않는다
const SCRIPT_ERROR_PATTERN = /^Lua error in |^mruby: uncaught exception in |^PANIC: |^mruby: this build has no mruby|^script restart failed: /;

/**
 * 엔진이 스크립트 오류를 알리는 첫 줄인가. 콘솔의 오류 줄(classifyEngineLine 의 error)보다 좁다: 스크립트가 그 자리에서
 * 멈춘 것만이고, 역추적 줄, 자원을 읽지 못한 줄, 게임이 찍은 글("error" 가 든 것)은 아니다
 */
export function isScriptErrorLine(line: string): boolean {
  return SCRIPT_ERROR_PATTERN.test(line);
}

// 오류: Lua PANIC, 예외와 백트레이스, 실패 보고, 웹 엔진의 치명적 오류(fatal:). 경고: warning, SDL_LogWarn 의 WARN, 자원을 못 찾았지만 계속 도는 경우
const ERROR_PATTERN = /PANIC|error|uncaught exception|attempt to |undefined method|stack traceback|most recent call last|\bfailed\b|cannot open|^\s*\[\d+\] |^fatal:/i;
const WARN_PATTERN = /warning|\bWARN\b|cannot load|cannot write/i;

/** 엔진 출력 한 줄의 콘솔 수준. stderr 인지가 아니라 내용으로 정한다 (SDL_Log 는 전부 stderr 로 간다) */
export function classifyEngineLine(line: string): Extract<LogLevel, "error" | "warn" | "info"> {
  if (ERROR_PATTERN.test(line) || isScriptErrorLine(line)) return "error";
  if (WARN_PATTERN.test(line)) return "warn";
  return "info";
}

const HOT_RELOAD_PATTERN = /HotReload: reloaded with (\d+) files?/;

/** `HotReload: reloaded with N files` 이면 N, 아니면 null */
export function parseHotReloadCount(line: string): number | null {
  const m = HOT_RELOAD_PATTERN.exec(line);
  return m ? Number(m[1]) : null;
}
