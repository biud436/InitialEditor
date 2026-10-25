// 「RPG Maker 2000 맵 따라 만들기」 영상의 게임 장면을 진짜 엔진으로 찍는다 (docs/tutorial-video.md).
//
// capture-editor.mjs 가 F5 순간마다 남긴 프로젝트(editor/runs/<이름>/)를 엔진 실행 파일로 창 없이 돌리고, 그린 프레임을
// 모두 받는다. 진입 스크립트는 촬영용 main.lua 로 바꾼다: 엔진이 한 프레임을 그릴 때마다 씬을 정확히 1/fps 초 나아가게 해서,
// 프레임 n 이 언제나 게임 시간 n/fps 초다 (창 없이 돌면 그리기와 틱이 벽시계에 맞지 않는다).
// 씬 로더와 타일맵 오브젝트 스크립트는 엔진 체크아웃의 것으로 덮는다 (템플릿이 엔진보다 오래되어도 물결이 움직인다).
//
//   node scripts/video/rm2k-tutorial/capture-game.mjs [--editor build/video/rm2k-tutorial/editor] [--engine ../Initial2D]
//
// 산출물: <editor>/../game/<이름>/00000.png ... 와 frames.json ({ fps, width, height, frames: [그림 번호] })

import { spawnSync } from "node:child_process";
import crypto from "node:crypto";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { parseArgs } from "node:util";

const { values: opts } = parseArgs({
  options: {
    editor: { type: "string", default: "build/video/rm2k-tutorial/editor" },
    engine: { type: "string", default: process.env.INITIAL2D_DIR ?? "../Initial2D" },
  },
});

const EDITOR = path.resolve(opts.editor);
const ENGINE = path.resolve(opts.engine);
const EXE = process.env.INITIAL2D_EXE ?? path.join(ENGINE, "build", process.platform === "win32" ? "Initial2D.exe" : "Initial2D");
const OUT = path.join(path.dirname(EDITOR), "game");
const timeline = JSON.parse(fs.readFileSync(path.join(EDITOR, "timeline.json"), "utf8"));
const FPS = timeline.fps;

const captureMain = `-- 영상 촬영용 진입 스크립트 (scripts/video/rm2k-tutorial/capture-game.mjs)
local SceneLoader = require("scripts/lua/scene_loader")
local scene
local frame = 0
function Initialize()
	local game = Json.Load("./game.json") or {}
	scene = SceneLoader.open(game.startScene or "main")
end
function Update(elapsed) end
function Render()
	local step = math.floor((frame + 1) * 1000 / ${FPS} + 0.5) - math.floor(frame * 1000 / ${FPS} + 0.5)
	frame = frame + 1
	scene = scene:tick(step)
	scene:draw()
end
function Destroy()
	scene:close()
end
`;

if (!fs.existsSync(EXE)) throw new Error(`엔진 실행 파일이 없다: ${EXE} (엔진 저장소에서 cmake --build build)`);

for (const name of fs.readdirSync(path.join(EDITOR, "runs"))) {
  const start = timeline.marks[`run-${name}`];
  const end = timeline.marks[`run-${name}-end`];
  if (start === undefined || end === undefined) throw new Error(`timeline.json 에 run-${name} 표시가 없다`);
  const frames = end - start + FPS;

  const work = fs.mkdtempSync(path.join(os.tmpdir(), "rm2k-video-"));
  fs.cpSync(path.join(EDITOR, "runs", name), work, { recursive: true });
  for (const rel of ["scripts/lua/scene_loader.lua", "scripts/lua/scene_types/tilemap.lua"]) {
    fs.copyFileSync(path.join(ENGINE, rel), path.join(work, rel));
  }
  fs.writeFileSync(path.join(work, "scripts/lua/main.lua"), captureMain);

  const shots = path.join(work, "shots");
  fs.mkdirSync(shots);
  const result = spawnSync(EXE, [], {
    cwd: work,
    encoding: "utf8",
    timeout: 300_000,
    env: {
      ...process.env,
      SDL_VIDEODRIVER: "dummy",
      SDL_AUDIODRIVER: "dummy",
      INITIAL2D_SCREENSHOT: path.join(shots, "f_%05ld.bmp"),
      INITIAL2D_SCREENSHOT_FRAME: Array.from({ length: frames }, (_, i) => i + 1).join(","),
      INITIAL2D_EXIT_AFTER: String(frames),
    },
  });
  const log = `${result.stdout ?? ""}${result.stderr ?? ""}`;
  if (result.status !== 0 || /PANIC|attempt to|stack traceback/.test(log)) {
    throw new Error(`${name}: 엔진 실행 실패 (종료 ${result.status})\n${log.slice(-2000)}`);
  }

  const dest = path.join(OUT, name);
  fs.rmSync(dest, { recursive: true, force: true });
  fs.mkdirSync(dest, { recursive: true });
  // BMP 를 PNG 로 (ffmpeg), 같은 그림은 한 장만 남긴다
  const png = path.join(work, "png");
  fs.mkdirSync(png);
  const ff = spawnSync("ffmpeg", ["-v", "error", "-start_number", "1", "-i", path.join(shots, "f_%05d.bmp"), path.join(png, "%05d.png")], { encoding: "utf8" });
  if (ff.status !== 0) throw new Error(`${name}: ffmpeg 실패\n${ff.stderr}`);
  const hashes = new Map();
  const list = [];
  let width = 0;
  let height = 0;
  for (let i = 1; i <= frames; i++) {
    const file = path.join(png, `${String(i).padStart(5, "0")}.png`);
    if (!fs.existsSync(file)) throw new Error(`${name}: 프레임 ${i} 이 없다`);
    const bytes = fs.readFileSync(file);
    if (!width) {
      width = bytes.readUInt32BE(16);
      height = bytes.readUInt32BE(20);
    }
    const hash = crypto.createHash("sha1").update(bytes).digest("hex");
    let index = hashes.get(hash);
    if (index === undefined) {
      index = hashes.size;
      hashes.set(hash, index);
      fs.writeFileSync(path.join(dest, `${String(index).padStart(5, "0")}.png`), bytes);
    }
    list.push(index);
  }
  fs.writeFileSync(path.join(dest, "frames.json"), JSON.stringify({ fps: FPS, width, height, frames: list }));
  fs.rmSync(work, { recursive: true, force: true });
  console.log(`${name}: ${frames} 프레임, 그림 ${hashes.size}장, ${width}x${height} → ${dest}`);
}
