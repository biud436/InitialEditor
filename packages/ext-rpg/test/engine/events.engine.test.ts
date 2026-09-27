// 진짜 엔진과의 이벤트 교차 검사 (docs/plans/e5-rpg.md 5.3). yarn test:engine-events 가 돈다.
//
// "에디터로만 만든 이벤트가 게임에서 돈다"를 사람이 아니라 스크립트가 확인한다.
//   1. 임시 작업 폴더: 엔진의 scripts/ 를 복사하고 resources/ 는 하위 폴더마다 심링크, 단 resources/maps/ 는 복사한다
//   2. 그 폴더의 port_town.json 을 모델만으로 연다 (ext-tilemap parseMap, ext-rpg EventsSection, 저장은 serializeMap)
//   3. ext-rpg 모델의 명령만으로 이벤트를 만든다 (UI 가 부를 것과 같은 EventEditor 와 newCommand)
//   4. 자동 재생과 같은 함수(eventPlayPlan, probeEnv)로 변수를 만들어 엔진을 프로세스로 헤드리스로 띄운다
//   5. trace 줄로 본다: 선 자리와 방향, 대사 순서와 분기 결과, rpg:route:done, rpg:error 없음
// 판 넷: 말 걸기(action), 밟기(touch 와 transfer 의 x, y, dir), auto 둘이 차례로, 시작 상태 arrived.
// 그리고 대조 셋: 저장한 transfer 에서 x, y, dir 을 하나씩 빼면 둘째 판의 도착 검사가 실패하는지 본다.
// 엔진 실행 파일이 없거나 M2 전 엔진이면 "SKIP: 이유" 한 줄을 찍고 통과한다 (완료 기준은 건너뛰지 않은 실행 기록을 요구한다).

import { execFileSync, spawnSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { UndoStack } from "@initial-editor/core";
import { parseMap, serializeMap, type MapData } from "@initial-editor/ext-tilemap/model";
import {
  cellsByDistance,
  eventPlayPlan,
  EventEditor,
  EventsSection,
  field,
  fileArgValue,
  frontCell,
  isStandable,
  itemIds,
  mapByName,
  newCommand,
  parseEventSchema,
  parseGameConfig,
  parseItemTable,
  probeEnv,
  validateEvents,
  type Cell,
  type EventSchema,
  type GameConfig,
  type ItemTable,
  type MapEntry,
  type PlayAt,
} from "../../src/model";

const ENGINE_DIR = path.resolve(process.env.INITIAL2D_DIR ?? path.join(__dirname, "..", "..", "..", "..", "..", "Initial2D"));
const EXE = path.join(ENGINE_DIR, "build", process.platform === "win32" ? "Initial2D.exe" : "Initial2D");
/** M2 계약 PR(엔진 #49)의 병합 커밋 */
const M2_COMMIT = "74febb4";
const KEEP = process.env.KEEP_WORKDIR === "1";

function findSkipReason(): string | null {
  if (!fs.existsSync(EXE)) return `엔진 실행 파일이 없다: ${EXE} (INITIAL2D_DIR 로 저장소 위치를 주거나 cmake 로 빌드한다)`;
  const probe = spawnSync(EXE, ["--features"], { encoding: "utf8", timeout: 30_000, env: { ...process.env, SDL_VIDEODRIVER: "dummy", SDL_AUDIODRIVER: "dummy" } });
  const features = new Set((probe.stdout ?? "").split(/\s+/).filter(Boolean));
  if (probe.status !== 0 || !features.has("lua")) return `엔진이 --features 에 lua 를 답하지 않는다 (종료 코드 ${String(probe.status)})`;
  const gameLua = path.join(ENGINE_DIR, "scripts", "lua", "games", "rpgdemo", "game.lua");
  const hasSchema = fs.existsSync(path.join(ENGINE_DIR, "resources", "schema", "event-commands.json"));
  const hasTrace = fs.existsSync(gameLua) && fs.readFileSync(gameLua, "utf8").includes("INITIAL2D_RPG_TRACE");
  if (!hasSchema || !hasTrace) return `엔진이 M2(RPG 이벤트 계약) 전이다. Initial2D 의 ${M2_COMMIT} 이후가 필요하다`;
  return null;
}

const skipReason = findSkipReason();

function engineCommit(): string {
  try {
    return execFileSync("git", ["-C", ENGINE_DIR, "rev-parse", "HEAD"], { encoding: "utf8" }).trim();
  } catch {
    return "(git 아님)";
  }
}

// ---- 검사 수 세기 ----

let checks = 0;
function check(label: string, ok: boolean, detail?: unknown): void {
  checks++;
  expect(ok, `${label}${detail === undefined ? "" : `\n${typeof detail === "string" ? detail : JSON.stringify(detail, null, 2)}`}`).toBe(true);
}

// ---- 작업 폴더와 엔진 실행 ----

let work = "";

function makeWorkdir(): string {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "initial2d-rpg-events-"));
  fs.cpSync(path.join(ENGINE_DIR, "scripts"), path.join(dir, "scripts"), { recursive: true });
  fs.mkdirSync(path.join(dir, "resources"));
  for (const name of fs.readdirSync(path.join(ENGINE_DIR, "resources"))) {
    const from = path.join(ENGINE_DIR, "resources", name);
    const to = path.join(dir, "resources", name);
    if (name === "maps") fs.cpSync(from, to, { recursive: true });
    else fs.symlinkSync(from, to);
  }
  return dir;
}

interface Run {
  status: number | null;
  lines: string[];
  log: string;
}

let runs = 0;

function runEngine(env: Record<string, string>): Run {
  runs++;
  const base: Record<string, string> = {};
  for (const [k, v] of Object.entries(process.env)) if (v !== undefined && !k.startsWith("INITIAL2D_")) base[k] = v;
  const r = spawnSync(EXE, [], {
    cwd: work,
    encoding: "utf8",
    timeout: 180_000,
    env: { ...base, SDL_VIDEODRIVER: "dummy", SDL_AUDIODRIVER: "dummy", INITIAL2D_NO_RTP: "1", INITIAL2D_EXIT_AFTER: "6000", ...env },
  });
  const stdout = r.stdout ?? "";
  return { status: r.status, lines: stdout.split(/\r?\n/).filter((l) => l.startsWith("rpg:")), log: stdout + (r.stderr ?? "") };
}

/** trace 의 대사 줄 꼴 (PlayEnv.escape: CR 은 빼고 LF 는 \n 두 글자) */
function messageLine(name: string, text: string): string {
  const esc = (s: string) => s.replace(/\r/g, "").replace(/\n/g, "\\n");
  return `rpg:message:${esc(name)}|${esc(text)}`;
}

function indexOf(lines: string[], line: string, from = 0): number {
  for (let i = from; i < lines.length; i++) if (lines[i] === line) return i;
  return -1;
}

function commonChecks(tag: string, run: Run): void {
  console.log(`[${tag}] rc=${String(run.status)}\n  ${run.lines.join("\n  ")}`);
  check(`[${tag}] 정상 종료`, run.status === 0, `rc=${String(run.status)}\n${run.log.slice(-800)}`);
  check(`[${tag}] Lua 오류 없음`, !run.log.includes("PANIC") && !run.log.includes("attempt to"), run.log.slice(-800));
  check(`[${tag}] rpg:error 가 없다`, !run.lines.some((l) => l.startsWith("rpg:error")), run.lines);
  check(`[${tag}] 경로를 다 걷고 스스로 끝난다`, run.lines[run.lines.length - 1] === "rpg:route:done", run.lines.slice(-5));
}

// ---- 모델 ----

let schema: EventSchema;
let game: GameConfig;
let items: ItemTable;
let entry: MapEntry;
let map: MapData;
let section: EventsSection;
let ed: EventEditor;
let stack: UndoStack;
let mapFile = "";
let baseCount = 0;
let start: PlayAt;

function readWork(rel: string): string {
  return fs.readFileSync(path.join(work, rel), "utf8");
}

function save(): string {
  const events = section.serialize() as unknown[] | undefined;
  const text = serializeMap({ ...map, events: events ?? null });
  fs.writeFileSync(mapFile, text);
  return text;
}

/** 정의 파일의 start = { x = .., y = .., dir = ".." } */
function defStart(defText: string): PlayAt {
  const m = /start\s*=\s*\{\s*x\s*=\s*(\d+)\s*,\s*y\s*=\s*(\d+)\s*,\s*dir\s*=\s*"(\w+)"/.exec(defText);
  if (!m) throw new Error("정의 파일에서 start 를 찾지 못했다");
  return { x: Number(m[1]), y: Number(m[2]), dir: m[3] as PlayAt["dir"] };
}

const onEvent = (c: Cell) => section.list.some((ev) => field(ev, "x") === c.x && field(ev, "y") === c.y);

/** 시작 근처의 놓을 수 있는 칸: 비었고, 설 수 있고, 앞 칸이 바로 옆이고 그 앞 칸에도 이벤트가 없다 */
function placeNear(probe: Record<string, unknown>): Cell {
  for (const c of cellsByDistance(map, start)) {
    if ((c.x === start.x && c.y === start.y) || onEvent(c) || !isStandable(map, section.list, c)) continue;
    const trial = [...section.list, { id: "probe", x: c.x, y: c.y, ...probe }];
    const front = frontCell(map, trial, trial.length - 1);
    if (!front || !front.adjacent || onEvent(front) || (front.x === start.x && front.y === start.y)) continue;
    return c;
  }
  throw new Error("놓을 칸이 없다");
}

function problemsOf(id: string) {
  return validateEvents(section.list, { schema, map, game, items: itemIds(items) }).filter((p) => p.eventId === id && p.severity !== "info");
}

/** 맵을 연 뒤 처음 선 자리의 trace 줄 (rpg:map:<맵> 다음의 첫 rpg:player:) */
function landing(lines: string[], mapName: string): string | undefined {
  const iMap = lines.findIndex((l) => l.startsWith(`rpg:map:${mapName} `));
  return iMap < 0 ? undefined : lines.slice(iMap + 1).find((l) => l.startsWith("rpg:player:"));
}

function playerLine(mapName: string, at: PlayAt): string {
  return `rpg:player:${mapName},${at.x},${at.y},${at.dir}`;
}

const DIRS: readonly PlayAt["dir"][] = ["down", "left", "right", "up"];

/**
 * transfer 의 대상: 여관의 설 수 있는 빈 칸 가운데 정의 파일의 시작과 x, y, dir 이 모두 다른 것.
 * 엔진은 빠진 x, y, dir 을 정의 파일의 시작 값으로 채우므로, 셋이 다 달라야 도착 줄이 셋 모두를 증명한다
 */
function transferTarget(): { entry: MapEntry; start: PlayAt; target: PlayAt } {
  const innEntry = mapByName(game, "inn");
  if (!innEntry) throw new Error("rpg-game.json 에 inn 이 없다");
  const innStart = defStart(readWork(innEntry.def));
  const innMap = parseMap(readWork(innEntry.file));
  const innEvents = new EventsSection(innMap.events, schema).list;
  const onInnEvent = (c: Cell) => innEvents.some((ev) => field(ev, "x") === c.x && field(ev, "y") === c.y);
  for (const c of cellsByDistance(innMap, innStart)) {
    if (c.x === innStart.x || c.y === innStart.y || onInnEvent(c) || !isStandable(innMap, innEvents, c)) continue;
    const dir = DIRS.find((d) => d !== innStart.dir)!;
    return { entry: innEntry, start: innStart, target: { x: c.x, y: c.y, dir } };
  }
  throw new Error("여관에 내릴 칸이 없다");
}

const SIGN_TEXT = '표지판에 글씨가 적혀 있다.\n"항구에 온 것을 환영한다" 라고 쓰여 있다.';

// 건너뛰면 SKIP 줄을 찍는 자리 하나만 등록한다 (돌 때는 건너뛴 테스트가 남지 않는다)
if (skipReason !== null) {
  describe("엔진 교차 검사", () => {
    it("건너뛴다", () => {
      console.log(`SKIP: ${skipReason}`);
    });
  });
} else describe("엔진 교차 검사: 에디터 모델로 만든 이벤트가 게임에서 돈다", () => {
  let plan1: { at: PlayAt; route: string };
  let text1 = "";
  let depth1 = 0;
  let door = -1;
  let text2 = "";
  let env2: Record<string, string> = {};
  let inn: { entry: MapEntry; start: PlayAt; target: PlayAt };

  beforeAll(() => {
    work = makeWorkdir();
    schema = parseEventSchema(readWork("resources/schema/event-commands.json"));
    game = parseGameConfig(readWork("resources/data/rpg-game.json"));
    items = parseItemTable(readWork(game.items!));
    entry = mapByName(game, "port_town")!;
    mapFile = path.join(work, entry.file);
    const text0 = fs.readFileSync(mapFile, "utf8");
    map = parseMap(text0);
    section = new EventsSection(map.events ?? undefined, schema);
    ed = new EventEditor(section, () => ({ schema, map }));
    stack = new UndoStack();
    baseCount = section.list.length;
    start = defStart(readWork(entry.def));
    check("모델로 읽고 다시 쓰면 바이트가 같다", save() === text0);
  });

  afterAll(() => {
    console.log(`engine-events: 판 ${runs}, 검사 ${checks}개 통과, 엔진 ${engineCommit()} (${EXE})`);
    if (KEEP) console.log(`작업 폴더를 남겼다: ${work}`);
    else if (work) fs.rmSync(work, { recursive: true, force: true });
  });

  it("[1] action 이벤트: 앞 칸에서 이벤트 쪽을 보고 서고, 대사와 분기가 순서대로 나온다", () => {
    const cell = placeNear({ charset: { set: "npc", index: 2 } });
    const add = ed.addEvent(cell);
    stack.push(add);
    const i = add.focus[0];
    stack.push(ed.renameEvent(i, "e2e_sign"));
    stack.push(ed.setField(i, "charset", { set: "npc", index: 2 }));
    stack.push(ed.insertCommands(i, [], 0, [newCommand(schema, "message", { text: "", name: "표지판", face: { set: "npc", index: 1 } })]));
    // 타이핑: 한 초점의 입력은 되돌리기 한 단계
    const depth = stack.depth;
    stack.push(ed.setArg(i, { list: [], index: 0 }, "text", SIGN_TEXT.slice(0, 10), { mergeKey: "typing" }));
    stack.push(ed.setArg(i, { list: [], index: 0 }, "text", SIGN_TEXT, { mergeKey: "typing" }));
    check("타이핑 두 번이 한 단계로 합쳐진다", stack.depth === depth + 1, stack.depth);
    stack.push(ed.insertCommands(i, [], 1, [newCommand(schema, "giveItem", { item: "shell" })]));
    stack.push(ed.insertCommands(i, [], 2, [newCommand(schema, "if", { cond: { item: "shell" } })]));
    stack.push(ed.insertCommands(i, [{ at: 2, list: "thenDo" }], 0, [newCommand(schema, "message", { text: "A" })]));
    stack.push(ed.insertCommands(i, [{ at: 2, list: "elseDo" }], 0, [newCommand(schema, "message", { text: "B" })]));
    stack.push(ed.insertCommands(i, [], 3, [newCommand(schema, "choice", { options: ["예", "아니요"] })]));
    stack.push(ed.insertCommands(i, [{ at: 3, list: "branches", branch: 0 }], 0, [newCommand(schema, "setFlag", { key: "e2e" })]));
    stack.push(ed.insertCommands(i, [], 4, [newCommand(schema, "if", { cond: { flag: "e2e" } })]));
    stack.push(ed.insertCommands(i, [{ at: 4, list: "thenDo" }], 0, [newCommand(schema, "message", { text: "C" })]));
    check("검사에 문제가 없다", problemsOf("e2e_sign").length === 0, problemsOf("e2e_sign"));

    text1 = save();
    depth1 = stack.depth;
    const saved = (parseMap(text1).events ?? []).find((e) => field(e, "id") === "e2e_sign");
    const expected = {
      id: "e2e_sign",
      x: cell.x,
      y: cell.y,
      trigger: "action",
      charset: { set: "npc", index: 2 },
      commands: [
        { code: "message", text: SIGN_TEXT, name: "표지판", face: { set: "npc", index: 1 } },
        { code: "giveItem", item: "shell" },
        { code: "if", cond: { item: "shell" }, thenDo: [{ code: "message", text: "A" }], elseDo: [{ code: "message", text: "B" }] },
        { code: "choice", options: ["예", "아니요"], branches: [[{ code: "setFlag", key: "e2e" }], []] },
        { code: "if", cond: { flag: "e2e" }, thenDo: [{ code: "message", text: "C" }] },
      ],
    };
    check("저장한 이벤트가 정해진 키 순서다", JSON.stringify(saved) === JSON.stringify(expected), saved);

    const planned = eventPlayPlan(map, section.list, i, "probe");
    if (!planned.ok || !planned.plan.at || planned.plan.route === null) throw new Error(planned.ok ? "자리 없음" : planned.reason);
    plan1 = { at: planned.plan.at, route: planned.plan.route };
    check("자동 재생은 talk 한 번", plan1.route === "talk");
    const env = probeEnv(game.play, { map: entry.name, at: plan1.at, state: null, route: plan1.route });
    check("실행 변수", env.INITIAL2D_MAP === "port_town" && env.INITIAL2D_RPG_AT === `${plan1.at.x},${plan1.at.y},${plan1.at.dir}` && env.INITIAL2D_RPG_ROUTE === "talk" && !("INITIAL2D_RPG_STATE" in env), env);

    const run = runEngine(env);
    const lines = run.lines;
    commonChecks("1", run);
    check("[1] 맵을 열었다 (이벤트 하나가 늘었고 건너뜀이 없다)", lines.includes(`rpg:map:port_town events:${baseCount + 1} skipped:0`), lines.slice(0, 4));
    const iPlayer = indexOf(lines, `rpg:player:port_town,${plan1.at.x},${plan1.at.y},${plan1.at.dir}`);
    check("[1] play.ts 가 고른 앞 칸에 이벤트 쪽을 보고 선다", iPlayer >= 0, lines.slice(0, 4));
    const iEvent = indexOf(lines, "rpg:event:e2e_sign");
    const iFirst = indexOf(lines, messageLine("표지판", SIGN_TEXT));
    const iA = indexOf(lines, messageLine("", "A"));
    const iChoice = indexOf(lines, "rpg:choice:예|아니요");
    const iC = indexOf(lines, messageLine("", "C"));
    check("[1] 이벤트가 돈다", iPlayer < iEvent, lines);
    check("[1] 첫 대사 (이름, 줄바꿈과 따옴표가 든 한글)", iEvent < iFirst, lines);
    check("[1] 아이템을 얻어 참 가지의 A", iFirst < iA, lines);
    check("[1] 거짓 가지의 B 는 없다", !lines.includes(messageLine("", "B")), lines);
    check("[1] 선택지", iA < iChoice, lines);
    check("[1] 첫 항목의 가지가 깃발을 세워 C", iChoice < iC, lines);
    const iCaptain = lines.findIndex((l) => l.startsWith("rpg:message:선장|"));
    check("[1] 새 게임이라 선장의 인사가 먼저 나온다", iCaptain > iPlayer && iCaptain < iEvent, lines);
  });

  it("[2] touch 이벤트: 한 걸음 밟으면 여관으로 옮기고 transfer 의 x, y, dir 에 선다", () => {
    inn = transferTarget();
    const { start: innStart, target } = inn;
    check(
      "[2] 대상이 여관 정의 파일의 시작과 x, y, dir 이 모두 다르다",
      target.x !== innStart.x && target.y !== innStart.y && target.dir !== innStart.dir,
      { target, innStart },
    );
    const cell = placeNear({ trigger: "touch" });
    const add = ed.addEvent(cell);
    stack.push(add);
    const j = add.focus[0];
    door = j;
    stack.push(ed.renameEvent(j, "e2e_door"));
    stack.push(ed.setField(j, "trigger", "touch"));
    stack.push(ed.insertCommands(j, [], 0, [newCommand(schema, "playSe", { file: fileArgValue("resources/audio/door.wav") })]));
    stack.push(ed.insertCommands(j, [], 1, [newCommand(schema, "transfer", { map: inn.entry.name, x: target.x, y: target.y, dir: target.dir })]));
    check("[2] 검사에 문제가 없다", problemsOf("e2e_door").length === 0, problemsOf("e2e_door"));
    text2 = save();
    const savedDoor = (parseMap(text2).events ?? []).find((e) => field(e, "id") === "e2e_door");
    const transfer = { code: "transfer", map: inn.entry.name, x: target.x, y: target.y, dir: target.dir };
    check("[2] 저장한 transfer 가 대상의 x, y, dir 을 싣는다", JSON.stringify(field(savedDoor, "commands")) === JSON.stringify([{ code: "playSe", file: "./resources/audio/door.wav" }, transfer]), savedDoor);

    const planned = eventPlayPlan(map, section.list, j, "probe");
    if (!planned.ok || !planned.plan.at || planned.plan.route === null) throw new Error(planned.ok ? "자리 없음" : planned.reason);
    const { at, route } = planned.plan;
    check("[2] 자동 재생은 이벤트 쪽으로 한 걸음", route === at.dir);
    env2 = probeEnv(game.play, { map: entry.name, at, route });
    const run = runEngine(env2);
    const lines = run.lines;
    commonChecks("2", run);
    const iPlayer = indexOf(lines, playerLine("port_town", at));
    const iEvent = indexOf(lines, "rpg:event:e2e_door");
    const iTransfer = indexOf(lines, `rpg:transfer:inn,${target.x},${target.y},${target.dir}`);
    const iInn = lines.findIndex((l) => l.startsWith("rpg:map:inn ") && l.endsWith(" skipped:0"));
    check("[2] 앞 칸에 선다", iPlayer >= 0, lines.slice(0, 4));
    check("[2] 밟아서 이벤트가 돈다", iPlayer < iEvent, lines);
    check("[2] transfer 줄", iEvent < iTransfer, lines);
    check("[2] 여관을 연다", iTransfer < iInn, lines);
    check(`[2] 여관 ${target.x},${target.y} 에 서서 ${target.dir} 쪽을 본다 (transfer 의 x, y, dir 이 적용되었다)`, landing(lines, "inn") === playerLine("inn", target), lines);
    check("[2] 정의 파일의 시작에는 서지 않는다", !lines.includes(playerLine("inn", innStart)), lines);
  });

  it("[2 대조] 저장한 transfer 에서 x, y, dir 을 하나씩 빼면 [2] 의 도착 검사가 실패한다 (빠진 값은 정의 파일의 시작 값)", () => {
    const { start: innStart, target } = inn;
    const cases: Array<{ key: "x" | "y" | "dir"; lands: PlayAt }> = [
      { key: "x", lands: { ...target, x: innStart.x } },
      { key: "y", lands: { ...target, y: innStart.y } },
      { key: "dir", lands: { ...target, dir: innStart.dir } },
    ];
    for (const { key, lands } of cases) {
      const depth = stack.depth;
      stack.push(ed.setArg(door, { list: [], index: 1 }, key, undefined));
      const savedDoor = (parseMap(save()).events ?? []).find((e) => field(e, "id") === "e2e_door");
      const transfer = (field(savedDoor, "commands") as unknown[])[1];
      check(`[2 대조 ${key}] 저장한 transfer 에 ${key} 가 없다`, field(transfer, key) === undefined && field(transfer, "map") === "inn", transfer);
      const run = runEngine(env2);
      commonChecks(`2 대조 ${key}`, run);
      check(`[2 대조 ${key}] [2] 의 도착 검사가 실패한다`, landing(run.lines, "inn") !== playerLine("inn", target), run.lines);
      check(`[2 대조 ${key}] 빠진 ${key} 는 정의 파일의 시작 값이다`, landing(run.lines, "inn") === playerLine("inn", lands), run.lines);
      stack.undo();
      check(`[2 대조 ${key}] 되돌리면 되돌리기 깊이가 그대로다`, stack.depth === depth, stack.depth);
    }
    check("[2 대조] 되돌린 맵이 [2] 의 맵과 바이트가 같다", save() === text2);
  });

  it("[3] auto 이벤트: 맵에 들어올 때 arrival 뒤에 차례로 돌고 스스로 끝난다", () => {
    const cell = placeNear({ trigger: "auto" });
    const add = ed.addEvent(cell);
    stack.push(add);
    const k = add.focus[0];
    stack.push(ed.renameEvent(k, "e2e_auto"));
    stack.push(ed.setField(k, "trigger", "auto"));
    stack.push(ed.insertCommands(k, [], 0, [newCommand(schema, "message", { text: "D" })]));
    check("[3] 검사에 문제가 없다", problemsOf("e2e_auto").length === 0, problemsOf("e2e_auto"));
    save();

    const planned = eventPlayPlan(map, section.list, k, "probe");
    if (!planned.ok) throw new Error(planned.reason);
    check("[3] 위치 없이 빈 경로", planned.plan.at === null && planned.plan.route === "");
    const env = probeEnv(game.play, { map: entry.name, at: null, route: "" });
    check("[3] AT 를 넣지 않고 빈 ROUTE 를 넣는다", !("INITIAL2D_RPG_AT" in env) && env.INITIAL2D_RPG_ROUTE === "", env);
    const run = runEngine(env);
    const lines = run.lines;
    commonChecks("3", run);
    check("[3] 정의 파일의 시작에 선다", indexOf(lines, `rpg:player:port_town,${start.x},${start.y},${start.dir}`) >= 0, lines.slice(0, 4));
    const iArrival = indexOf(lines, "rpg:event:arrival");
    const iAuto = indexOf(lines, "rpg:event:e2e_auto");
    const iD = indexOf(lines, messageLine("", "D"));
    check("[3] arrival 이 먼저", iArrival >= 0 && iArrival < iAuto, lines);
    check("[3] 둘째 auto 의 대사", iAuto < iD, lines);
  });

  it("[4] 되돌리기로 첫 판의 맵으로 돌아가 시작 상태 arrived 로 띄우면 선장의 인사가 없다", () => {
    while (stack.depth > depth1) stack.undo();
    check("[4] 되돌린 맵이 첫 판의 맵과 바이트가 같다", save() === text1);
    const env = probeEnv(game.play, { map: entry.name, at: plan1.at, state: "arrived", route: plan1.route });
    check("[4] 시작 상태 변수", env.INITIAL2D_RPG_STATE === "arrived", env);
    const run = runEngine(env);
    const lines = run.lines;
    commonChecks("4", run);
    check("[4] arrival 은 돌지만", lines.includes("rpg:event:arrival"), lines);
    check("[4] 선장의 인사가 없다", !lines.some((l) => l.startsWith("rpg:message:선장|")), lines);
    const iFirst = indexOf(lines, messageLine("표지판", SIGN_TEXT));
    const iC = indexOf(lines, messageLine("", "C"));
    check("[4] 표지판의 대사는 그대로", iFirst >= 0 && iFirst < iC, lines);
    check("[4] 두 번째 판의 이벤트는 없다", !lines.includes("rpg:event:e2e_door") && !lines.includes("rpg:event:e2e_auto"), lines);
  });
});
