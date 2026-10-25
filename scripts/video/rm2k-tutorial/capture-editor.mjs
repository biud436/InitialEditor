// 「RPG Maker 2000 맵 따라 만들기」 영상의 에디터 장면을 찍는다 (docs/tutorial-video.md).
// docs/guide/rm2k-tutorial.md 의 순서를 그대로 하고, 자막과 카메라와 강조를 함께 적는다.
//
//   node scripts/video/rm2k-tutorial/capture-editor.mjs --chipset <Exterior.png> [--url ...] [--out ...] [--stop-after <장 번호>]
//
// 산출물 (--out, 기본 build/video/rm2k-tutorial/editor):
//   ui/*.png, timeline.json   Recorder 의 산출물
//   runs/<이름>/               F5 를 누른 순간의 프로젝트 파일. capture-game.mjs 가 이 폴더로 엔진을 돌린다

import fs from "node:fs";
import path from "node:path";
import { parseArgs } from "node:util";
import { chromium } from "playwright";
import { Recorder, union } from "../lib/recorder.mjs";

const { values: opts } = parseArgs({
  options: {
    url: { type: "string", default: "http://127.0.0.1:4173/?backend=browser" },
    out: { type: "string", default: "build/video/rm2k-tutorial/editor" },
    chipset: { type: "string" },
    "stop-after": { type: "string" },
    // 디버그: 이 장 앞까지는 찍지 않고 시계만 돌린다 (뒤쪽 장을 빨리 확인할 때)
    "dry-until": { type: "string" },
  },
});
if (!opts.chipset) throw new Error("--chipset <Exterior.png> 가 필요하다 (docs/tutorial-video.md)");

const OUT = path.resolve(opts.out);
const WIDTH = 1600;
const HEIGHT = 900;
const FOLDER = "호숫가";
const CHIPSET = "resources/ChipSet/Exterior.png";

// 만들 맵 (문서와 같은 자리)
const LAKE = [2, 2, 9, 7];
const DEEP = [4, 3, 7, 5];
const ROADS = [
  [0, 11, 19, 12],
  [11, 3, 12, 10],
];
const FLOWERS = [
  [15, 8],
  [3, 9],
  [8, 9],
  [17, 5],
  [6, 13],
];
const TREES = [
  [15, 5],
  [17, 9],
  [1, 14],
  [18, 14],
];
const FENCE = [14, 2];

// 팔레트 칸 (6열). 하층 쪽: 0 물 A1, 2 깊은 물, 6 D1(풀), 8 D3(흙). 상층 쪽: F 번호 그대로
const PAL = { waterA1: 0, deep: 2, grass: 6, dirt: 8, treeTop: 2, trunk: 8, flower: 18, fence: [24, 26] };

fs.mkdirSync(OUT, { recursive: true });
fs.rmSync(path.join(OUT, "runs"), { recursive: true, force: true });

// macOS 는 Metal 로 그린다. 기본(SwiftShader)은 맵 뷰의 WebGL 을 CPU 로 그려 세 배쯤 느리다
const gpu = process.platform === "darwin" ? ["--use-angle=metal", "--enable-gpu", "--ignore-gpu-blocklist"] : [];
const browser = await chromium.launch({ args: ["--mute-audio", ...gpu] });
const context = await browser.newContext({
  viewport: { width: WIDTH, height: HEIGHT },
  deviceScaleFactor: 2,
  colorScheme: "dark",
  // 단축키 표기를 문서와 같은 Ctrl 로 (editor/platform.ts 가 navigator 로 고른다)
  userAgent: "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0.0.0 Safari/537.36",
});
await context.addInitScript(`
  Object.defineProperty(Navigator.prototype, "platform", { get: () => "Win32" });
  window.showDirectoryPicker = async () => (await navigator.storage.getDirectory()).getDirectoryHandle(${JSON.stringify(FOLDER)}, { create: true });
`);
const page = await context.newPage();
await page.clock.install();
const cdp = await context.newCDPSession(page);

const ev = (src, arg = null) =>
  page.evaluate(([s, a]) => Promise.resolve(new Function("e", "a", `return (${s})(e, a)`)(window.initialEditor, a)).then((v) => JSON.parse(JSON.stringify(v ?? null))), [src, arg]);
const box = async (locator) => {
  const b = await locator.boundingBox();
  if (!b) throw new Error(`화면에 없다: ${locator}`);
  return b;
};
const tid = (id) => page.getByTestId(id);
/** 도킹 패널의 탭 머리 (dockview) */
const dockTab = (title) => page.locator(".dv-tab").filter({ hasText: new RegExp(`^${title}$`) }).first();
const isActiveTab = async (tab) => ((await tab.getAttribute("class")) ?? "").includes("dv-active-tab");

await page.goto(opts.url);
await page.evaluate(async () => {
  localStorage.clear();
  const root = await navigator.storage.getDirectory();
  for await (const name of root.keys()) await root.removeEntry(name, { recursive: true });
});
await page.reload();
await tid("launcher").waitFor();
await page.waitForTimeout(500);

const rec = new Recorder(page, cdp, OUT, { fps: 30, width: WIDTH, height: HEIGHT });
await rec.start();
rec.dry = opts["dry-until"] !== undefined;

/** 장. n 은 문서의 절 번호, 0 은 준비 */
async function chapter(n, title) {
  if (opts["dry-until"] !== undefined && n >= Number(opts["dry-until"])) rec.dry = false;
  await rec.waitCaption();
  rec.clearCaption();
  rec.event("chapter", { n, title });
  rec.camera("full");
  await rec.hold(2.2);
}
const stopAfter = (n) => opts["stop-after"] !== undefined && Number(opts["stop-after"]) === n;
async function finish() {
  await rec.waitCaption();
  rec.clearCaption();
  await rec.hold(0.6);
  rec.save({ chipset: CHIPSET });
  await browser.close();
  console.log(`${rec.frames.length} 프레임 (${rec.time.toFixed(1)}초), 그림 ${rec.images.length}장 → ${OUT}`);
  process.exit(0);
}

// ── 맵 뷰와 팔레트 도우미 ─────────────────────────────────────────────
const view = () => page.locator('[data-testid="map-view"]:not([hidden])');
async function cell(cx, cy) {
  const v = view();
  const b = await box(v.locator("canvas"));
  const zoom = Number(await v.getAttribute("data-zoom"));
  const panX = Number(await v.getAttribute("data-pan-x"));
  const panY = Number(await v.getAttribute("data-pan-y"));
  return { x: b.x + (cx * 16 + 8) * zoom + panX, y: b.y + (cy * 16 + 8) * zoom + panY };
}
async function cellBox(x0, y0, x1, y1) {
  const a = await cell(x0, y0);
  const b = await cell(x1, y1);
  const half = (b.x - a.x) / Math.max(1, x1 - x0) / 2 || 16;
  return { x: a.x - half, y: a.y - half, width: b.x - a.x + half * 2, height: b.y - a.y + half * 2 };
}
async function mapBox() {
  return cellBox(0, 0, 19, 14);
}
async function paletteCell(index) {
  const canvas = tid("palette-canvas");
  const b = await box(canvas);
  const size = 16 * Number(await canvas.getAttribute("data-zoom"));
  const col = index % 6;
  const row = Math.floor(index / 6);
  return { x: b.x + col * size, y: b.y + row * size, width: size, height: size };
}
async function pick(index) {
  await rec.clickBox(await paletteCell(index), { after: 0.35 });
}
async function paletteSide(side) {
  await rec.clickBox(await box(tid("palette-page-tab").filter({ hasText: side })), { after: 0.3 });
}
async function layer(i) {
  await rec.clickBox(await box(page.locator(`[data-testid="layer-row"][data-target="layer:${i}"]`)), { after: 0.3 });
}
async function rect([x0, y0, x1, y1], seconds = 0.9) {
  const a = await cell(x0, y0);
  const b = await cell(x1, y1);
  await rec.drag([a, b], { seconds });
}
async function tap(x, y) {
  const c = await cell(x, y);
  await rec.click(c.x, c.y, { after: 0.15 });
}
async function menu(branch, ...items) {
  await rec.clickBox(await box(page.getByRole("menubar").getByRole("menuitem", { name: branch, exact: true })), { after: 0.2 });
  let parent = null;
  for (let i = 0; i < items.length; i++) {
    const last = i === items.length - 1;
    const label = page.locator(".menu-label", { hasText: last ? new RegExp(`${items[i]}$`) : new RegExp(`^${items[i]}$`) }).first();
    const row = last ? page.locator(".menu-item").filter({ has: label }).first() : page.locator(".menu-item-wrap").filter({ has: label }).first();
    await rec.until(() => row.isVisible(), { what: `메뉴 ${items[i]}`, timeout: 3 });
    const b = await box(row);
    // 하위 메뉴로는 옆으로 먼저 들어간다. 비스듬히 가면 다른 항목 위를 지나며 하위 메뉴가 바뀐다
    if (parent) await rec.moveTo(b.x + 16, parent.y + parent.height / 2, 0.3);
    if (last) await rec.clickBox(b, { after: 0.3 });
    else {
      await rec.moveToBox(b);
      await rec.hold(0.35);
    }
    parent = b;
  }
}
async function fillField(locator, text) {
  await rec.clickBox(await box(locator), { after: 0.1 });
  await locator.fill("");
  await rec.type(text, { cps: 14, after: 0.2 });
}
async function exportRun(name) {
  const files = await ev(`async (e) => {
    const out = [];
    const walk = async (dir) => { for (const ent of await e.backend.list(dir)) { if (ent.kind === "dir") await walk(ent.path); else out.push(ent.path); } };
    await walk("");
    return out;
  }`);
  const dest = path.join(OUT, "runs", name);
  for (const rel of files) {
    if (rel.startsWith(".initial-editor/")) continue;
    const bytes = await ev("async (e, a) => Array.from(await e.backend.readBinary(a))", rel);
    fs.mkdirSync(path.dirname(path.join(dest, rel)), { recursive: true });
    fs.writeFileSync(path.join(dest, rel), Buffer.from(bytes));
  }
  return files.length;
}

// ── 0. 시작 창 ────────────────────────────────────────────────────────
rec.camera("full");
await rec.hold(0.8);

// ── 1. 프로젝트 만들기 ────────────────────────────────────────────────
await chapter(0, "타일맵 프로젝트 만들기");
await rec.say("시작 창에서 **새 게임**을 누릅니다.");
await rec.clickBox(await box(tid("launcher").getByRole("button", { name: /새 게임/ })), { after: 0.2 });
await rec.until(() => tid("new-project-dialog").isVisible(), { what: "새 게임 대화상자" });
await rec.hold(0.4);
const dialog = await box(tid("new-project-dialog"));
rec.camera(dialog, { pad: 32 });
await rec.say("템플릿은 **타일맵**을 선택합니다. 타일셋, 맵 한 장, 맵을 표시하는 씬이 들어 있습니다.");
await rec.clickBox(await box(tid("new-project-template").getByText("타일맵", { exact: true })), { after: 0.8 });
await rec.say("게임 이름을 적고 **폴더 선택**으로 폴더를 정한 뒤 **만들기**를 누릅니다.");
await fillField(page.getByLabel("게임 이름"), FOLDER);
await rec.clickBox(await box(tid("new-project-pick")), { after: 0.2 });
await rec.until(() => tid("new-project-folder").innerText().then((t) => t.includes(FOLDER)), { what: "폴더" });
await rec.hold(0.6);
await rec.clickBox(await box(tid("new-project-ok")), { after: 0.2 });
await rec.until(() => tid("project-tree").locator('[data-path="game.json"]').isVisible(), { what: "프로젝트 열기" });
rec.camera("full");
await rec.hold(1.0);
if (stopAfter(0)) await finish();

// ── 2. ChipSet 넣기 ───────────────────────────────────────────────────
await chapter(1, "ChipSet을 프로젝트에 넣기");
const projectTab = dockTab("프로젝트");
if ((await projectTab.isVisible().catch(() => false)) && !(await isActiveTab(projectTab))) await rec.clickBox(await box(projectTab), { after: 0.2 });
const tree = tid("project-tree");
rec.camera(union(await box(tid("project-panel"))), { pad: 16, maxZoom: 1.8 });
await rec.say("ChipSet PNG를 프로젝트 폴더의 `resources` 아래로 복사합니다. 이 영상은 `resources/ChipSet/Exterior.png`를 씁니다.");
rec.event("drop", { name: "Exterior.png", box: await box(tid("project-panel")) });
await rec.hold(1.0);
await ev("(e, a) => e.backend.writeBinary(a.path, new Uint8Array(a.bytes))", { path: CHIPSET, bytes: [...fs.readFileSync(opts.chipset)] });
await ev("async (e) => { await e.project.refresh('resources'); await e.project.refresh('resources/ChipSet').catch(() => {}); return null; }");
const resourcesRow = tree.locator('[data-path="resources"]').first();
if ((await resourcesRow.getAttribute("aria-expanded")) === "false") await rec.clickBox(await box(resourcesRow), { after: 0.2 });
await rec.until(() => tree.locator('[data-path="resources/ChipSet"]').isVisible(), { what: "ChipSet 폴더" });
const chipRow = tree.locator('[data-path="resources/ChipSet"]').first();
if ((await chipRow.getAttribute("aria-expanded")) !== "true") await rec.clickBox(await box(chipRow), { after: 0.2 });
await rec.until(() => tree.locator(`[data-path="${CHIPSET}"]`).isVisible(), { what: "ChipSet 파일" });
rec.highlight(await box(tree.locator(`[data-path="${CHIPSET}"]`)), { seconds: 2.5 });
await rec.hold(1.2);
await rec.say("데스크톱 앱은 프로젝트 폴더를 감시하므로 복사한 파일이 **프로젝트** 패널에 바로 나타납니다.");
if (stopAfter(1)) await finish();

// ── 3. 새 맵 ─────────────────────────────────────────────────────────
await chapter(2, "새 맵 만들기");
await rec.say("**맵 > 새 맵**(Ctrl+Alt+M)을 엽니다.");
await rec.key("Control+Alt+KeyM", { keys: ["Ctrl", "Alt", "M"], label: "새 맵" });
await rec.until(() => tid("new-map-dialog").isVisible(), { what: "새 맵 대화상자" });
await rec.hold(0.3);
rec.camera(await box(tid("new-map-dialog")), { pad: 24 });
await rec.say("이름은 `lakeside`, 크기는 20x15 타일입니다. RPG Maker 2000의 화면 한 장(320x240)과 같은 크기입니다.");
await fillField(tid("new-map-name"), "lakeside");
await fillField(tid("new-map-width"), "20");
await fillField(tid("new-map-height"), "15");
await rec.say("타일 크기는 ChipSet의 타일과 같은 16입니다.");
await fillField(tid("new-map-tile"), "16");
await rec.say("**타일셋**에서 ChipSet을 선택하면 **형식**이 **RPG Maker 2000 ChipSet**으로 바뀝니다.");
await rec.pretendClick(await box(tid("new-map-tileset")));
await tid("new-map-tileset").selectOption(CHIPSET);
await rec.until(() => tid("new-map-kind").isVisible(), { what: "형식 항목", timeout: 4 });
await rec.hold(0.3);
rec.camera(await box(tid("new-map-dialog")), { pad: 24 });
rec.highlight(await box(tid("new-map-kind")), { seconds: 3 });
await rec.hold(1.0);
const waveRow = page.getByText("물결", { exact: true }).first();
const speedRow = page.getByText("물결 빠르기", { exact: true }).first();
rec.highlight(union(await box(waveRow), await box(speedRow), await box(tid("new-map-dialog").locator("select").nth(3))), { seconds: 3 });
await rec.say("**물결**과 **물결 빠르기**는 RPG Maker 2000의 기본값인 왕복, 보통을 그대로 둡니다.");
await rec.say("레이어는 `lower, upper, over` 세 개입니다. 앞에 적은 레이어부터 아래에 그립니다.");
await fillField(tid("new-map-layers"), "lower, upper, over");
await rec.say("**만들기**를 누르면 ChipSet을 아틀라스로 바꿔 쓰고 새 맵을 엽니다.");
await rec.clickBox(await box(tid("new-map-ok")), { after: 0.2 });
await rec.until(() => page.getByTestId("doc-tab").filter({ hasText: "lakeside.json" }).isVisible(), { what: "맵 탭" });
await rec.until(() => view().getAttribute("data-ready").then((v) => v === "true"), { what: "맵 뷰" });
rec.camera("full");
await rec.hold(0.8);
await rec.say("팔레트와 레이어 패널이 크게 보이도록 **창 > 레이아웃 > 타일맵**을 선택합니다.");
await menu("창", "레이아웃", "타일맵");
await rec.until(() => tid("palette-canvas").getAttribute("data-ready").then((v) => v === "true"), { what: "팔레트" });
await rec.hold(0.5);
const plus = tid("map-zoom").locator("xpath=following-sibling::button[1]");
for (let i = 0; i < 4 && Number(await view().getAttribute("data-zoom")) < 2; i++) await rec.clickBox(await box(plus), { after: 0.4 });
await rec.hold(0.5);
if (stopAfter(2)) await finish();

// ── 4. 팔레트 ────────────────────────────────────────────────────────
await chapter(3, "팔레트 읽기");
const paletteTop = union(await box(tid("palette-page-tab").first()), await box(tid("palette-hover")), await paletteCell(0), await paletteCell(6 * 6 + 5));
rec.camera(paletteTop, { pad: 12, maxZoom: 2 });
await rec.say("팔레트의 **하층** 쪽 첫 줄은 물 A1, 물 A2, 깊은 물, 애니메이션 타일 C1, C2, C3입니다.");
for (const i of [0, 1, 2, 3, 4, 5]) await rec.moveToBox(await paletteCell(i), 0.35).then(() => rec.hold(0.35));
await rec.say("둘째 줄과 셋째 줄은 땅 오토타일 D1에서 D12, 넷째 줄부터는 하층 타일 E0에서 E143입니다.");
for (const i of [6, 8, 12, 17, 18, 24]) await rec.moveToBox(await paletteCell(i), 0.4).then(() => rec.hold(0.4));
rec.highlight(await box(tid("palette-hover")), { seconds: 2.5 });
await rec.say("타일 위에 마우스를 올리면 그 타일의 이름이 팔레트 위 오른쪽에 표시됩니다.");
await paletteSide("상층");
await rec.say("**상층** 쪽은 상층 타일 F0에서 F143입니다. 첫 타일 F0은 빈 타일이며, 칠하면 그 자리를 비웁니다.");
for (const i of [0, 2, 8, 18]) await rec.moveToBox(await paletteCell(i), 0.4).then(() => rec.hold(0.45));
await paletteSide("하층");
if (stopAfter(3)) await finish();

// ── 5. 땅과 물 ───────────────────────────────────────────────────────
await chapter(4, "땅과 물 칠하기");
rec.camera(union(await box(tid("layers")), await box(tid("map-target"))), { pad: 16, maxZoom: 1.6 });
await rec.say("레이어 패널에서 `lower`를 선택합니다. 맵 뷰 위쪽의 **대상**에 `lower`가 표시됩니다.");
await layer(0);
rec.highlight(await box(tid("map-target")), { seconds: 2 });
await rec.hold(0.8);
const work = union(await paletteCell(0), await paletteCell(6 * 6 + 5), await mapBox());
rec.camera(work, { pad: 8 });
await rec.say("풀 오토타일 D1을 클릭하고 **채우기**(G)로 맵을 클릭합니다.");
await pick(PAL.grass);
await rec.key("g", { keys: ["G"], label: "채우기" });
await tap(10, 7);
await rec.hold(0.6);
await rec.say("맵 전체가 풀이 됩니다. 맵 밖은 같은 지형으로 보므로 가장자리에 테두리가 생기지 않습니다.");
await rec.say("**물 A1**을 클릭하고 **사각형**(R)으로 (2, 2)에서 (9, 7)까지 드래그합니다.");
await pick(PAL.waterA1);
await rec.key("r", { keys: ["R"], label: "사각형" });
await rect(LAKE, 1.2);
rec.camera(await cellBox(0, 0, 11, 9), { pad: 8, maxZoom: 2 });
await rec.say("호수 둘레에 물가가 생기고, 물과 물가가 게임과 같은 간격으로 출렁입니다.");
await rec.hold(1.0);
await rec.say("**Ctrl+Z**를 한 번 누르면 호수 전체가 사라지고, **Ctrl+Shift+Z**로 다시 나타납니다.");
await rec.key("Control+KeyZ", { keys: ["Ctrl", "Z"], label: "되돌리기", after: 1.0 });
await rec.key("Control+Shift+KeyZ", { keys: ["Ctrl", "Shift", "Z"], label: "다시 하기", after: 1.0 });
rec.camera(work, { pad: 8 });
await rec.say("**깊은 물**을 클릭하고 (4, 3)에서 (7, 5)까지 드래그합니다.");
await pick(PAL.deep);
await rect(DEEP, 0.9);
rec.camera(await cellBox(1, 1, 10, 8), { pad: 8, maxZoom: 2.2 });
await rec.say("깊은 물이 얕은 물에 둘러싸이면 네 모서리가 둥글게 그려집니다.");
await rec.hold(0.6);
rec.camera(work, { pad: 8 });
await rec.say("흙 오토타일 D3으로 길을 냅니다. 두 길이 만나는 자리는 한 길로 이어집니다.");
await pick(PAL.dirt);
await rect(ROADS[0], 1.2);
await rect(ROADS[1], 0.9);
rec.camera(await cellBox(7, 7, 19, 14), { pad: 8, maxZoom: 2.2 });
await rec.say("풀(D1)과 흙(D3)은 서로 다른 지형이라 경계에 흙의 가장자리가 그려집니다.");
await rec.hold(0.6);
if (stopAfter(4)) await finish();

// ── 6. 나무와 꽃 ─────────────────────────────────────────────────────
await chapter(5, "나무와 꽃 놓기");
rec.camera(union(await box(tid("layers")), await box(tid("palette"))), { pad: 12, maxZoom: 1.4 });
await rec.say("레이어 패널에서 `upper`를 선택하고 팔레트를 **상층** 쪽으로 바꿉니다.");
await layer(1);
await paletteSide("상층");
rec.camera(work, { pad: 8 });
await rec.say("꽃 타일을 클릭하고 **펜**(B)으로 풀밭 몇 곳을 클릭합니다.");
await pick(PAL.flower);
await rec.key("b", { keys: ["B"], label: "펜" });
for (const [x, y] of FLOWERS) await tap(x, y);
await rec.say("나무는 위아래 두 타일입니다. 밑동 타일은 `upper`에 놓습니다.");
await pick(PAL.trunk);
for (const [x, y] of TREES) await tap(x, y);
await rec.say("윗부분은 `over` 레이어에 놓습니다. `over`는 캐릭터 위에 그리므로 캐릭터가 지나가면 가려집니다.");
await layer(2);
await pick(PAL.treeTop);
for (const [x, y] of TREES) await tap(x, y - 1);
await rec.say("팔레트에서 여러 타일을 드래그하면 그 사각형 그대로 한 번에 찍힙니다.");
await layer(1);
const f0 = await paletteCell(PAL.fence[0]);
const f1 = await paletteCell(PAL.fence[1]);
await rec.drag([{ x: f0.x + f0.width / 2, y: f0.y + f0.height / 2 }, { x: f1.x + f1.width / 2, y: f1.y + f1.height / 2 }], { seconds: 0.6 });
await tap(FENCE[0], FENCE[1]);
await rec.hold(0.4);
await rec.say("**Ctrl+S**로 저장합니다.");
await rec.key("Control+KeyS", { keys: ["Ctrl", "S"], label: "저장" });
await rec.moveTo(WIDTH - 40, HEIGHT - 60, 0.8);
rec.camera(await mapBox(), { pad: 16, maxZoom: 2.4 });
await rec.hold(2.5);
if (stopAfter(5)) await finish();

// ── 7. 게임에서 보기 ─────────────────────────────────────────────────
await chapter(6, "게임에서 보기");
await rec.say("타일맵 템플릿의 시작 씬 `main.json`에는 맵을 그리는 오브젝트 `map`이 있습니다.");
await rec.clickBox(await box(page.getByTestId("doc-tab").filter({ hasText: "main.json" })), { after: 0.5 });
const hierTab = dockTab("계층");
await rec.until(() => hierTab.isVisible(), { what: "계층 탭", timeout: 5 });
if (!(await isActiveTab(hierTab))) await rec.clickBox(await box(hierTab), { after: 0.3 });
await rec.clickBox(await box(tid("hierarchy-row").filter({ hasText: "map" }).first()), { after: 0.4 });
await rec.until(() => tid("prop-map").isVisible(), { what: "인스펙터의 맵 파일" });
rec.camera(await box(tid("inspector")), { pad: 12, maxZoom: 1.8 });
await rec.say("인스펙터의 **맵 파일**을 `lakeside.json`으로 바꿉니다.");
await rec.pretendClick(await box(tid("prop-map")));
await tid("prop-map").selectOption("resources/maps/lakeside.json");
await rec.hold(0.8);
const ground = page.getByRole("spinbutton", { name: /오브젝트 아래 레이어 수/ });
await rec.say("**오브젝트 아래 레이어 수**는 2입니다. `lower`와 `upper`는 다른 오브젝트 아래에, `over`는 위에 그립니다.");
await fillField(ground, "2");
await page.keyboard.press("Enter");
await rec.hold(0.6);
await rec.say("저장하고 **F5**로 실행합니다.");
await rec.key("Control+KeyS", { keys: ["Ctrl", "S"], label: "저장" });
rec.camera("full");
await exportRun("small");
await rec.waitCaption();
rec.event("key", { keys: ["F5"], label: "실행" });
await rec.hold(0.4);
rec.mark("run-small");
await rec.say("새 게임의 도트 화면은 320x180이라 20x15 맵(320x240)의 아래쪽이 잘립니다.");
await rec.waitCaption();
await rec.hold(0.6);
rec.mark("run-small-end");
await rec.say("RPG Maker 2000과 같은 화면으로 보려면 `game.json`을 창 640x480, 배율 2로 바꿉니다.");
const projTab = dockTab("프로젝트");
if (!(await isActiveTab(projTab))) await rec.clickBox(await box(projTab), { after: 0.3 });
const gameRow = tree.locator('[data-path="game.json"]').first();
await gameRow.scrollIntoViewIfNeeded();
await rec.hold(0.2);
await rec.clickBox(await box(gameRow), { after: 0.2, count: 2 });
await rec.until(() => page.getByTestId("doc-tab").filter({ hasText: "game.json" }).isVisible(), { what: "game.json 탭" });
await rec.until(() => page.locator(".monaco-editor .view-line").first().isVisible(), { what: "편집기" });
await rec.hold(0.5);
const editorBox = await box(page.locator(".monaco-editor").first());
rec.camera({ x: editorBox.x, y: editorBox.y, width: Math.min(editorBox.width, 640), height: 260 }, { pad: 12, maxZoom: 2 });
for (const [from, to] of [
  ["960", "640"],
  ["540", "480"],
  ["3", "2"],
]) {
  const token = page.locator(".monaco-editor .view-line span span", { hasText: new RegExp(`^${from},?$`) }).first();
  await rec.click(...center(await box(token)), { count: 2, after: 0.1 });
  await rec.type(to, { cps: 10, after: 0.4 });
}
await rec.key("Control+KeyS", { keys: ["Ctrl", "S"], label: "저장" });
rec.camera("full");
await exportRun("full");
await rec.waitCaption();
rec.event("key", { keys: ["F5"], label: "실행" });
await rec.hold(0.4);
rec.mark("run-full");
await rec.say("논리 화면이 320x240이 되고 두 배로 확대되어 창을 채웁니다. 물과 물가는 맵 뷰와 같은 간격으로 움직입니다.");
await rec.waitCaption();
await rec.hold(1.5);
rec.mark("run-full-end");
if (stopAfter(6)) await finish();

// ── 8. 통행 ──────────────────────────────────────────────────────────
await chapter(7, "통행 정하기");
await rec.clickBox(await box(page.getByTestId("doc-tab").filter({ hasText: "lakeside.json" })), { after: 0.5 });
await rec.until(() => view().getAttribute("data-ready").then((v) => v === "true"), { what: "맵 뷰" });
rec.camera(union(await mapBox(), await box(tid("map-toggle-collision"))), { pad: 12 });
await rec.say("ChipSet의 통행 설정은 맵에 들어오지 않습니다. 지나갈 수 없는 곳은 맵의 통행 레이어에 칠합니다.");
await rec.say("맵 뷰 위쪽의 **통행** 버튼을 누르면 지나갈 수 없는 타일이 표시됩니다.");
await rec.clickBox(await box(tid("map-toggle-collision")), { after: 0.4 });
await rec.say("**통행**(C) 도구로 호수와 나무 밑동을 칠합니다. 왼쪽 버튼은 지나갈 수 없는 타일, 오른쪽 버튼은 지나갈 수 있는 타일로 바꿉니다.");
await rec.key("c", { keys: ["C"], label: "통행" });
const zig = [];
for (let y = LAKE[1]; y <= LAKE[3]; y++) {
  const row = (y - LAKE[1]) % 2 === 0 ? [LAKE[0], LAKE[2]] : [LAKE[2], LAKE[0]];
  for (const x of row) zig.push(await cell(x, y));
}
await rec.drag(zig, { seconds: 3.2 });
for (const [x, y] of TREES) await tap(x, y);
await rec.say("게임 스크립트는 `Tilemap.IsPassable(map, x, y)`로 통행을 읽습니다.");
await rec.key("Control+KeyS", { keys: ["Ctrl", "S"], label: "저장" });
await rec.moveTo(WIDTH - 40, HEIGHT - 60, 0.8);
rec.camera(await mapBox(), { pad: 16, maxZoom: 2.4 });
await rec.hold(2.0);
await finish();

function center(b) {
  return [b.x + b.width / 2, b.y + b.height / 2];
}
