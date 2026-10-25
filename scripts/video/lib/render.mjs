// 합성 페이지(window.seek(t))를 프레임마다 찍어 ffmpeg 로 영상을 만든다 (docs/tutorial-video.md).
//
//   node scripts/video/lib/render.mjs --page <video.html> --data <재료 폴더> [--file 이름=경로 ...] --out <영상.mp4>
//   [--times 1,8.5,20 --stills <폴더>]   몇 장만 PNG 로 (설계 확인)
//   [--from 30 --to 60]                   구간만 렌더
//
// 페이지는 /page/ 아래, 재료는 /data/ 아래에서 읽는다 (--file 은 /data/<이름> 으로 더 얹는다). 소리는 무음 트랙을 붙인다.

import { spawn } from "node:child_process";
import fs from "node:fs";
import http from "node:http";
import path from "node:path";
import { parseArgs } from "node:util";
import { chromium } from "playwright";

const { values: opts } = parseArgs({
  options: {
    page: { type: "string" },
    data: { type: "string" },
    file: { type: "string", multiple: true, default: [] },
    out: { type: "string" },
    times: { type: "string" },
    stills: { type: "string" },
    from: { type: "string" },
    to: { type: "string" },
    fps: { type: "string", default: "30" },
  },
});
if (!opts.page || !opts.data) throw new Error("--page 와 --data 가 필요하다");

const PAGE_DIR = path.dirname(path.resolve(opts.page));
const DATA_DIR = path.resolve(opts.data);
const extra = new Map(opts.file.map((f) => [f.slice(0, f.indexOf("=")), path.resolve(f.slice(f.indexOf("=") + 1))]));
const FPS = Number(opts.fps);
const TYPES = { ".html": "text/html; charset=utf-8", ".js": "text/javascript; charset=utf-8", ".json": "application/json", ".png": "image/png", ".css": "text/css" };

const server = http.createServer((req, res) => {
  const url = decodeURIComponent(new URL(req.url, "http://x").pathname);
  let file = null;
  if (url.startsWith("/page/")) file = path.join(PAGE_DIR, url.slice(6));
  else if (url.startsWith("/data/")) file = extra.get(url.slice(6)) ?? path.join(DATA_DIR, url.slice(6));
  if (!file || !fs.existsSync(file) || fs.statSync(file).isDirectory()) {
    res.writeHead(404).end();
    return;
  }
  res.writeHead(200, { "content-type": TYPES[path.extname(file)] ?? "application/octet-stream" });
  fs.createReadStream(file).pipe(res);
});
await new Promise((r) => server.listen(0, "127.0.0.1", r));
const port = server.address().port;

const gpu = process.platform === "darwin" ? ["--use-angle=metal", "--enable-gpu", "--ignore-gpu-blocklist"] : [];
const browser = await chromium.launch({ args: ["--mute-audio", "--font-render-hinting=none", ...gpu] });
const page = await browser.newPage({ viewport: { width: 1920, height: 1080 }, deviceScaleFactor: 1 });
page.on("pageerror", (e) => console.error("페이지 오류:", e.message));
await page.goto(`http://127.0.0.1:${port}/page/${path.basename(opts.page)}?data=/data/`);
await page.waitForFunction(() => window.ready === true, null, { timeout: 120_000 });
const duration = await page.evaluate(() => window.duration);
const cdp = await page.context().newCDPSession(page);
const shot = async () => Buffer.from((await cdp.send("Page.captureScreenshot", { format: "png" })).data, "base64");
console.log(`길이 ${duration.toFixed(2)}초 (${Math.round(duration * FPS)} 프레임)`);

if (opts.times) {
  const dir = path.resolve(opts.stills ?? "stills");
  fs.mkdirSync(dir, { recursive: true });
  for (const t of opts.times.split(",").map(Number)) {
    await page.evaluate((t) => window.seek(t), t);
    fs.writeFileSync(path.join(dir, `t${t.toFixed(2).padStart(7, "0")}.png`), await shot());
  }
  console.log(`정지 화면 → ${dir}`);
} else {
  if (!opts.out) throw new Error("--out 이 필요하다");
  fs.mkdirSync(path.dirname(path.resolve(opts.out)), { recursive: true });
  const first = Math.round(Number(opts.from ?? 0) * FPS);
  const last = Math.min(Math.round(duration * FPS), opts.to ? Math.round(Number(opts.to) * FPS) : Infinity);
  const ff = spawn("ffmpeg", [
    "-y", "-v", "error",
    "-f", "image2pipe", "-framerate", String(FPS), "-c:v", "png", "-i", "-",
    "-f", "lavfi", "-i", "anullsrc=r=48000:cl=stereo",
    "-shortest", "-map", "0:v", "-map", "1:a",
    "-c:v", "libx264", "-preset", "slow", "-crf", "18", "-pix_fmt", "yuv420p", "-r", String(FPS),
    "-c:a", "aac", "-b:a", "96k", "-movflags", "+faststart",
    path.resolve(opts.out),
  ], { stdio: ["pipe", "inherit", "inherit"] });
  const done = new Promise((resolve, reject) => ff.on("close", (code) => (code === 0 ? resolve() : reject(new Error(`ffmpeg 종료 ${code}`)))));
  const started = Date.now();
  for (let i = first; i < last; i++) {
    await page.evaluate((t) => window.seek(t), i / FPS);
    if (!ff.stdin.write(await shot())) await new Promise((r) => ff.stdin.once("drain", r));
    if ((i - first) % 300 === 299) {
      const rate = (i - first + 1) / ((Date.now() - started) / 1000);
      console.log(`  ${i + 1}/${last} 프레임 (${rate.toFixed(1)} 프레임/초, 남은 시간 ${Math.round((last - i) / rate)}초)`);
    }
  }
  ff.stdin.end();
  await done;
  console.log(`→ ${path.resolve(opts.out)}`);
}
await browser.close();
server.close();
