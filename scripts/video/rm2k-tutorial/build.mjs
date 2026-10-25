// 「RPG Maker 2000 맵 따라 만들기」 영상을 처음부터 만든다 (docs/tutorial-video.md).
//
//   yarn build                                        # 에디터를 먼저 빌드한다 (dist/)
//   node scripts/video/rm2k-tutorial/build.mjs [--engine ../Initial2D] [--skip-editor] [--skip-game] [--times 1,30,90] [--stop-after <장>]
//
// 순서: ChipSet 받기 → 에디터 미리보기 서버 → 에디터 촬영 → 게임 촬영 → 합성과 인코딩.
// 산출물은 build/video/rm2k-tutorial/ 아래이고 영상은 build/video/rm2k-tutorial.mp4 다.

import { spawn, spawnSync } from "node:child_process";
import crypto from "node:crypto";
import fs from "node:fs";
import net from "node:net";
import path from "node:path";
import { parseArgs } from "node:util";

const { values: opts } = parseArgs({
  options: {
    engine: { type: "string", default: process.env.INITIAL2D_DIR ?? "../Initial2D" },
    "skip-editor": { type: "boolean", default: false },
    "skip-game": { type: "boolean", default: false },
    times: { type: "string" },
    port: { type: "string", default: "4181" },
    // 에디터 촬영을 이 장(0 준비 .. 7)까지만 하고 끝낸다 (빠른 확인)
    "stop-after": { type: "string" },
  },
});

const ROOT = path.resolve(path.dirname(new URL(import.meta.url).pathname), "..", "..", "..");
const OUT = path.join(ROOT, "build", "video", "rm2k-tutorial");
const HERE = path.join(ROOT, "scripts", "video", "rm2k-tutorial");
fs.mkdirSync(OUT, { recursive: true });

// EasyRPG RTP 의 Exterior (JasonPerry, CC0). 받은 파일은 저장소에 넣지 않는다 (build/ 는 gitignore)
const CHIPSET = path.join(OUT, "chipset.png");
const CHIPSET_URL = "https://raw.githubusercontent.com/EasyRPG/RTP/089148227963f0e75ef6ceeb4051db13f275ef82/ChipSet/Exterior.png";
const CHIPSET_SHA256 = "65366c85efee8a71cdc77a87a94d51ee3884d25e0833d4e68839201a02c679d2";

function run(cmd, args, extra = {}) {
  console.log(`\n$ ${cmd} ${args.join(" ")}`);
  const r = spawnSync(cmd, args, { stdio: "inherit", cwd: ROOT, ...extra });
  if (r.status !== 0) throw new Error(`${cmd} 실패 (종료 ${r.status})`);
}

if (!fs.existsSync(CHIPSET)) {
  console.log(`ChipSet 받기: ${CHIPSET_URL}`);
  const res = await fetch(CHIPSET_URL);
  if (!res.ok) throw new Error(`ChipSet 을 받지 못했다 (${res.status})`);
  fs.writeFileSync(CHIPSET, Buffer.from(await res.arrayBuffer()));
}
const sha = crypto.createHash("sha256").update(fs.readFileSync(CHIPSET)).digest("hex");
if (sha !== CHIPSET_SHA256) throw new Error(`ChipSet 의 sha256 이 다르다: ${sha}`);

if (!opts["skip-editor"]) {
  if (!fs.existsSync(path.join(ROOT, "dist", "index.html"))) throw new Error("dist/ 가 없다. yarn build 를 먼저 한다");
  const preview = spawn("yarn", ["workspace", "@initial-editor/app", "preview", "--port", opts.port, "--host", "127.0.0.1"], { cwd: ROOT, stdio: "ignore", detached: true });
  try {
    await waitPort(Number(opts.port));
    const stop = opts["stop-after"] !== undefined ? ["--stop-after", opts["stop-after"]] : [];
    run("node", [path.join(HERE, "capture-editor.mjs"), "--url", `http://127.0.0.1:${opts.port}/?backend=browser`, "--chipset", CHIPSET, "--out", path.join(OUT, "editor"), ...stop]);
  } finally {
    process.kill(-preview.pid);
  }
}
if (opts["stop-after"] !== undefined) process.exit(0);
if (!opts["skip-game"]) {
  run("node", [path.join(HERE, "capture-game.mjs"), "--editor", path.join(OUT, "editor"), "--engine", path.resolve(ROOT, opts.engine)]);
}
const render = [path.join(ROOT, "scripts", "video", "lib", "render.mjs"), "--page", path.join(HERE, "video.html"), "--data", OUT, "--file", `chipset.png=${CHIPSET}`];
if (opts.times) run("node", [...render, "--times", opts.times, "--stills", path.join(OUT, "stills")]);
else run("node", [...render, "--out", path.join(ROOT, "build", "video", "rm2k-tutorial.mp4")]);

async function waitPort(port, timeoutMs = 30_000) {
  const until = Date.now() + timeoutMs;
  while (Date.now() < until) {
    const ok = await new Promise((resolve) => {
      const s = net.connect(port, "127.0.0.1", () => {
        s.end();
        resolve(true);
      });
      s.on("error", () => resolve(false));
    });
    if (ok) return;
    await new Promise((r) => setTimeout(r, 300));
  }
  throw new Error(`미리보기 서버가 ${port} 에서 뜨지 않았다`);
}
