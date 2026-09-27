// 웹판(Cloudflare Pages) e2e (docs/plans/e6-packaging.md 7.5).
//
// 응답 헤더: Pages 가 packages/app/public/_headers 를 적용한 응답을 본다 (vite preview 는 _headers 를 모른다).
//   PAGES_URL=<주소>   이미 띄운 Pages 를 본다 (CI 와 로컬: npx wrangler@3 pages dev dist --port 8788 뒤 PAGES_URL=http://127.0.0.1:8788)
//   PAGES_WRANGLER=1   이 스펙이 npx wrangler@3 pages dev dist 를 직접 띄운다 (포트 PAGES_PORT, 기본 8788).
//                      wrangler 를 받지 못하거나 뜨지 않으면 까닭을 적고 헤더 검사를 건너뛴다
//   둘 다 없으면 헤더 검사는 까닭을 적고 건너뛴다.
// 흐름 (헤더와 무관하다. 헤더를 보는 서버가 있으면 그것으로, 없으면 Playwright 가 띄운 vite preview 로):
//   웹판 시작 화면 → 샘플로 해 보기(샘플 맵이 열린다) → F5 로 게임 탭 → sample:frame 과 sample:map 줄 → 캡처 → 정지 →
//   맵 뷰에서 한 칸을 모래로 칠하고 저장 → F5 → 캡처의 그 칸 밝기가 달라지고 나머지 칸은 그대로다.
//   콘솔(에디터와 브라우저)에 wasm streaming compile failed 가 없다.
//   정보 창: 판, 커밋(빌드 도장), 웹 엔진 커밋(MANIFEST), 데스크톱 앱 받기(window.open 으로 새 탭), 제3자 고지(engine/THIRD-PARTY.md).

import { expect, test, type Page } from "@playwright/test";
import { spawn, type ChildProcess } from "node:child_process";
import { existsSync, readFileSync } from "node:fs";
import path from "node:path";

const DIST = path.resolve("dist");
const WRANGLER_TIMEOUT_MS = 120_000;
/** 샘플 맵(meadow.json, 20x12 칸, 16px). 게임은 이것을 창 가운데에 그린다 */
const MAP = { width: 20, height: 12, tile: 16 };
const GAME = { width: 768, height: 896 };
/** 칠할 칸 (바닥은 풀이고 장식이 없다)과 붓 (gid 5, 모래: 팔레트 1행 5열) */
const PAINT = { x: 4, y: 5, gid: 5 };
const STREAMING_FAILED = "wasm streaming compile failed";

interface PagesServer {
  url: string | null;
  /** url 이 없는 까닭 (헤더 검사를 건너뛰는 이유) */
  reason: string | null;
  child?: ChildProcess;
}

let pages: PagesServer = { url: null, reason: "아직 정하지 않았다" };

async function reachable(url: string): Promise<boolean> {
  try {
    return (await fetch(url, { signal: AbortSignal.timeout(2000) })).ok;
  } catch {
    return false;
  }
}

/** PAGES_URL, 또는 PAGES_WRANGLER=1 이면 wrangler 를 띄운다 */
async function startPages(): Promise<PagesServer> {
  const given = process.env.PAGES_URL?.trim().replace(/\/+$/, "");
  if (given) return { url: given, reason: null };
  if (process.env.PAGES_WRANGLER !== "1") {
    return { url: null, reason: "PAGES_URL 이 없다. npx wrangler@3 pages dev dist --port 8788 뒤 PAGES_URL=http://127.0.0.1:8788 로, 또는 PAGES_WRANGLER=1 로 돌린다" };
  }
  if (!existsSync(path.join(DIST, "_headers"))) return { url: null, reason: "dist/_headers 가 없다 (yarn build 를 먼저)" };
  const port = Number(process.env.PAGES_PORT ?? 8788);
  const url = `http://127.0.0.1:${port}`;
  if (await reachable(url)) return { url: null, reason: `${url} 에 이미 다른 서버가 있다 (PAGES_PORT 로 바꾼다)` };
  const child = spawn("npx", ["--yes", "wrangler@3", "pages", "dev", DIST, "--ip", "127.0.0.1", "--port", String(port)], {
    env: { ...process.env, WRANGLER_SEND_METRICS: "false", CI: "1" },
    stdio: ["ignore", "pipe", "pipe"],
    detached: true,
  });
  let log = "";
  let exited: string | null = null;
  child.stdout?.on("data", (c: Buffer) => (log += c.toString()));
  child.stderr?.on("data", (c: Buffer) => (log += c.toString()));
  child.on("error", (e) => (exited = e.message));
  child.on("exit", (code, signal) => (exited = `종료 코드 ${code ?? signal}`));
  const deadline = Date.now() + WRANGLER_TIMEOUT_MS;
  while (Date.now() < deadline && !exited) {
    if (await reachable(url)) return { url, reason: null, child };
    await new Promise((r) => setTimeout(r, 1000));
  }
  stopPages({ url: null, reason: null, child });
  const tail = log.trim().split("\n").slice(-5).join(" / ");
  return { url: null, reason: `npx wrangler@3 pages dev 를 받거나 띄우지 못했다 (${exited ?? `${WRANGLER_TIMEOUT_MS / 1000}초 안에 답이 없다`}): ${tail || "출력 없음"}` };
}

function stopPages(server: PagesServer): void {
  const pid = server.child?.pid;
  if (!pid || server.child?.exitCode !== null) return;
  try {
    process.kill(-pid, "SIGTERM"); // wrangler 가 띄운 workerd 까지
  } catch {
    server.child?.kill("SIGTERM");
  }
}

test.describe.configure({ mode: "serial" });

test.beforeAll(async () => {
  test.setTimeout(WRANGLER_TIMEOUT_MS + 30_000);
  pages = await startPages();
  // 보고서(list)는 건너뛴 까닭을 한 줄로만 보이므로 여기 남긴다
  if (pages.reason) console.info(`pages.spec 헤더 검사를 건너뛴다: ${pages.reason}`);
  else console.info(`pages.spec: ${pages.url}`);
});

test.afterAll(() => {
  stopPages(pages);
});

/** index.html 이 부르는 해시 이름의 스크립트 (/assets/index-*.js) */
function hashedAsset(): string {
  const html = readFileSync(path.join(DIST, "index.html"), "utf8");
  const m = /src="(\/assets\/[^"]+\.js)"/.exec(html);
  if (!m) throw new Error("dist/index.html 에 /assets/ 스크립트가 없다");
  return m[1];
}

test.describe("웹판 응답 헤더 (_headers)", () => {
  test("engine/Initial2D.wasm 은 application/wasm 이고 엔진 파일은 매번 다시 확인한다 (immutable 이 아니다)", async ({ request }) => {
    test.skip(!pages.url, pages.reason ?? "");
    for (const rel of ["/engine/Initial2D.wasm", "/engine/MANIFEST.json", "/engine/Initial2D.js", "/engine/initial2d-loader.js"]) {
      const res = await request.get(`${pages.url}${rel}`);
      expect(res.status(), rel).toBe(200);
      const cache = res.headers()["cache-control"] ?? "";
      expect(cache, rel).toContain("no-cache");
      expect(cache, rel).not.toContain("immutable");
    }
    const wasm = await request.get(`${pages.url}/engine/Initial2D.wasm`);
    expect(wasm.headers()["content-type"]).toBe("application/wasm");
    expect([...(await wasm.body()).subarray(0, 4)]).toEqual([0x00, 0x61, 0x73, 0x6d]);
  });

  test("해시 이름의 assets 는 오래 두고, 모든 응답에 nosniff 와 referrer 정책이 있고 교차 출처 격리 헤더는 없다", async ({ request }) => {
    test.skip(!pages.url, pages.reason ?? "");
    const asset = hashedAsset();
    const res = await request.get(`${pages.url}${asset}`);
    expect(res.status()).toBe(200);
    expect(res.headers()["cache-control"]).toBe("public, max-age=31536000, immutable");
    for (const rel of ["/", asset, "/engine/Initial2D.wasm", "/engine/THIRD-PARTY.md"]) {
      const h = (await request.get(`${pages.url}${rel}`)).headers();
      expect(h["x-content-type-options"], rel).toBe("nosniff");
      expect(h["referrer-policy"], rel).toBe("strict-origin-when-cross-origin");
      expect(h["cross-origin-opener-policy"], rel).toBeUndefined();
      expect(h["cross-origin-embedder-policy"], rel).toBeUndefined();
    }
  });

  test("엔진 제3자 고지(engine/THIRD-PARTY.md)가 나간다", async ({ request }) => {
    test.skip(!pages.url, pages.reason ?? "");
    const res = await request.get(`${pages.url}/engine/THIRD-PARTY.md`);
    expect(res.status()).toBe(200);
    expect(await res.text()).toContain("# 제3자 고지");
  });
});

type CanvasStats = { width: number; height: number; nonBackground: number; grid: number[] };
type EditorWindow = {
  initialEditor: {
    gameView: { capture(): Promise<CanvasStats | null> };
    documents: { active: { path: string | null; model: { layers: Array<{ data: number[] }> } } | null };
    log: { entries: Array<{ text: string }> };
  };
};

function capture(page: Page): Promise<CanvasStats | null> {
  return page.evaluate(() => (window as unknown as EditorWindow).initialEditor.gameView.capture());
}

function consoleRows(page: Page, text: string) {
  return page.getByTestId("console-list").locator(".console-row", { hasText: text });
}

/** 칠할 칸이 든 캡처 격자 칸의 번호 (게임은 맵을 창 가운데에 그린다) */
function paintedGridCell(stats: CanvasStats): number {
  const cells = Math.round(Math.sqrt(stats.grid.length));
  const scale = stats.width / GAME.width;
  const originX = Math.floor((GAME.width - MAP.width * MAP.tile) / 2);
  const originY = Math.floor((GAME.height - MAP.height * MAP.tile) / 2);
  const cx = (originX + PAINT.x * MAP.tile + MAP.tile / 2) * scale;
  const cy = (originY + PAINT.y * MAP.tile + MAP.tile / 2) * scale;
  return Math.floor((cy * cells) / stats.height) * cells + Math.floor((cx * cells) / stats.width);
}

/** 맵이 다 그려진 캡처 (맵의 픽셀 수만큼 배경이 아니다) */
async function mapCapture(page: Page): Promise<CanvasStats> {
  await expect.poll(async () => (await capture(page))?.nonBackground ?? 0, { timeout: 10_000 }).toBeGreaterThanOrEqual(MAP.width * MAP.height * MAP.tile * MAP.tile);
  return (await capture(page))!;
}

test.describe("웹판 흐름 (샘플 맵을 칠하고 F5)", () => {
  test("샘플로 해 보기 → F5 → 맵의 한 칸을 칠하고 저장 → F5 면 게임 화면의 그 칸만 바뀐다. 스트리밍 컴파일 실패 줄이 없다", async ({ page, baseURL }) => {
    test.setTimeout(120_000);
    const base = pages.url ?? baseURL!;
    const browserConsole: string[] = [];
    page.on("console", (m) => browserConsole.push(m.text()));
    await page.goto(`${base}/?backend=browser`);
    await page.getByTestId("welcome").getByRole("button", { name: "샘플로 해 보기" }).click();
    await expect(page.getByTestId("doc-tab").filter({ hasText: "meadow.json" })).toBeVisible();
    const mapView = page.getByTestId("map-view");
    await expect(mapView).toHaveAttribute("data-ready", "true");

    // 처음 실행: 칠하기 전의 화면
    await page.keyboard.press("F5");
    const game = page.getByTestId("game-view");
    await expect(game).toHaveAttribute("data-phase", "running", { timeout: 30_000 });
    await expect(consoleRows(page, "sample:frame")).toHaveCount(1, { timeout: 15_000 });
    await expect(consoleRows(page, "sample:map layers=2")).toHaveCount(1);
    const before = await mapCapture(page);
    await page.keyboard.press("Shift+F5");
    await expect(game).toHaveAttribute("data-phase", "ended", { timeout: 10_000 });

    // 맵 뷰에서 칠한다: 팔레트에서 모래를 고르고 펜으로 한 칸
    await page.getByTestId("doc-tab").filter({ hasText: "meadow.json" }).click();
    await expect(mapView).toHaveAttribute("data-ready", "true");
    await expect(mapView).toHaveAttribute("data-tool", "pen");
    const palette = page.getByTestId("palette-canvas");
    await expect(palette).toHaveAttribute("data-ready", "true");
    const pz = Number(await palette.getAttribute("data-zoom"));
    const col = (PAINT.gid - 1) % 8;
    const row = Math.floor((PAINT.gid - 1) / 8);
    await palette.click({ position: { x: (col + 0.5) * MAP.tile * pz, y: (row + 0.5) * MAP.tile * pz } });
    await expect(page.getByTestId("palette-brush")).toHaveText(`붓 gid ${PAINT.gid}`);
    const box = (await mapView.locator("canvas").boundingBox())!;
    const [zoom, panX, panY] = await Promise.all(["data-zoom", "data-pan-x", "data-pan-y"].map(async (a) => Number(await mapView.getAttribute(a))));
    await page.mouse.click(box.x + (PAINT.x * MAP.tile + MAP.tile / 2) * zoom + panX, box.y + (PAINT.y * MAP.tile + MAP.tile / 2) * zoom + panY);
    const cell = () => page.evaluate((i) => (window as unknown as EditorWindow).initialEditor.documents.active?.model.layers[0].data[i], PAINT.y * MAP.width + PAINT.x);
    expect(await cell()).toBe(PAINT.gid);
    await page.keyboard.press("ControlOrMeta+s");
    await expect(page.getByTestId("toasts")).toContainText("저장했다: meadow.json");

    // 다시 실행: 그 칸만 다르다
    await page.keyboard.press("F5");
    await expect(game).toHaveAttribute("data-phase", "running", { timeout: 30_000 });
    await expect(consoleRows(page, "sample:frame")).toHaveCount(2, { timeout: 15_000 });
    const after = await mapCapture(page);
    const painted = paintedGridCell(after);
    const diffs = after.grid.map((v, i) => Math.abs(v - before.grid[i]));
    expect(diffs[painted], `칠한 칸(격자 ${painted})의 밝기 차이`).toBeGreaterThan(3);
    expect(diffs.filter((d, i) => i !== painted && d > 1), "칠하지 않은 칸의 밝기 차이").toEqual([]);
    await page.keyboard.press("Shift+F5");
    await expect(game).toHaveAttribute("data-phase", "ended", { timeout: 10_000 });

    const editorLog = await page.evaluate(() => (window as unknown as EditorWindow).initialEditor.log.entries.map((e) => e.text));
    expect(editorLog.filter((t) => t.includes(STREAMING_FAILED))).toEqual([]);
    expect(browserConsole.filter((t) => t.includes(STREAMING_FAILED))).toEqual([]);
    expect(editorLog.filter((t) => /Lua error|sample:map error/.test(t))).toEqual([]);
  });
});

test.describe("웹판 정보 창", () => {
  test("판, 커밋, 웹 엔진 커밋을 보이고 데스크톱 앱 받기는 새 탭으로, 제3자 고지는 엔진의 고지 파일을 보인다", async ({ page, baseURL }) => {
    const base = pages.url ?? baseURL!;
    const manifest = JSON.parse(readFileSync(path.resolve("packages/app/public/engine/MANIFEST.json"), "utf8")) as { engineCommit: string; features: string[] };
    // 바깥으로 나가지 않게 window.open 을 기록만 하는 것으로 바꾼다
    await page.addInitScript(() => {
      const w = window as unknown as { __opened: unknown[][]; open: (...args: unknown[]) => null };
      w.__opened = [];
      w.open = (...args: unknown[]) => {
        w.__opened.push(args);
        return null;
      };
    });
    await page.goto(`${base}/?backend=browser`);
    await page.getByRole("menubar").getByRole("menuitem", { name: "도움말", exact: true }).click();
    await page.locator(".menu-item", { hasText: "InitialEditor 정보" }).first().click();
    const about = page.getByTestId("about-dialog");
    await expect(about.getByTestId("about-version")).toHaveText(/^\d+\.\d+\.\d+/);
    await expect(about.getByTestId("about-commit")).toHaveText(/^[0-9a-f]{7}$/);
    await expect(about.getByTestId("about-web-engine")).toHaveText(`${manifest.engineCommit.slice(0, 7)} (${manifest.features.join(" ")})`);
    await expect(about.getByTestId("about-mode")).toContainText("브라우저 폴더");

    const edition = about.getByTestId("about-edition");
    await expect(edition).toHaveText("데스크톱 앱 받기");
    await edition.click();
    expect(await page.evaluate(() => (window as unknown as { __opened: unknown[][] }).__opened)).toEqual([["https://github.com/biud436/InitialEditor/releases", "_blank", "noopener,noreferrer"]]);
    expect(page.url()).toContain("backend=browser");

    await about.getByTestId("about-notices").click();
    const notices = page.getByTestId("notices-text");
    await expect(notices).toContainText("# 제3자 고지");
    await expect(notices).toContainText("emsdk");
  });
});
