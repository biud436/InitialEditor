// 「RPG Maker 2000 맵 따라 만들기」 영상의 합성 (docs/tutorial-video.md).
//
// window.seek(t) 가 t초의 화면을 만든다. 모든 움직임을 t 의 함수로 계산하므로 어느 프레임을 어느 순서로 찍어도 같은 그림이다.
// 재료는 ?data= 아래의 editor/(capture-editor.mjs), game/(capture-game.mjs), chipset.png 다.
//
// 구성: 처음(완성한 맵) → 준비: ChipSet 의 구역 → 에디터 장면(카메라, 커서, 강조, 자막, 단축키, 게임 창) → 끝(정리와 출처)

const params = new URLSearchParams(location.search);
const DATA = params.get("data") ?? "/data/";
const W = 1920;
const H = 1080;

const clamp = (v, a = 0, b = 1) => Math.min(b, Math.max(a, v));
const prog = (t, a, b) => clamp((t - a) / (b - a));
const easeOut = (k) => 1 - (1 - k) ** 3;
const easeInOut = (k) => (k < 0.5 ? 4 * k * k * k : 1 - (-2 * k + 2) ** 3 / 2);
const lerp = (a, b, k) => a + (b - a) * k;
const $ = (id) => document.getElementById(id);

/** capture 의 Recorder 와 같은 규칙 */
function readingTime(text) {
  const chars = [...text.replace(/\*\*|`|\s+/g, "")].length;
  return Math.max(2.2, 0.9 + chars / 9);
}

function rich(text) {
  const esc = text.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
  return esc.replace(/`([^`]+)`/g, "<code>$1</code>").replace(/\*\*([^*]+)\*\*/g, "<b>$1</b>");
}

// ── 재료 ──────────────────────────────────────────────────────────────
const cache = new Map();
function load(url) {
  let p = cache.get(url);
  if (!p) {
    const im = new Image();
    im.src = url;
    p = im.decode().then(() => im);
    cache.set(url, p);
    if (cache.size > 24) cache.delete(cache.keys().next().value);
  }
  return p;
}

const editor = await (await fetch(DATA + "editor/timeline.json")).json();
const games = {};
for (const name of ["small", "full"]) games[name] = await (await fetch(`${DATA}game/${name}/frames.json`)).json();
const chipset = await load(DATA + "chipset.png");
document.getElementById("dropimg").src = chipset.src;
const FPS = editor.fps;

const gameUrl = (name, i) => `${DATA}game/${name}/${String(games[name].frames[clamp(i, 0, games[name].frames.length - 1)]).padStart(5, "0")}.png`;

// ── 장 ───────────────────────────────────────────────────────────────
const STEPS = ["ChipSet을 프로젝트에 넣기", "새 맵 만들기", "팔레트 읽기", "땅과 물 칠하기", "나무와 꽃 놓기", "게임에서 보기", "통행 정하기"];

function stepsHtml(n) {
  return STEPS.map((_, i) => `<i class="${i + 1 === n ? "on" : i + 1 < n ? "done" : ""}"></i>`).join("");
}
function setBadge(el, n) {
  el.textContent = n === 0 ? "준비" : String(n);
  el.classList.toggle("prep", n === 0);
}
let chipState = "";
function showChip(n, title, opacity) {
  const key = `${n}|${title}`;
  if (chipState !== key) {
    chipState = key;
    setBadge($("chipbadge"), n);
    $("chiptitle").textContent = title;
    $("chipsteps").innerHTML = stepsHtml(n);
  }
  $("chip").style.opacity = opacity;
}
let cardState = "";
function showCard(n, title, age) {
  const key = `${n}|${title}`;
  if (cardState !== key) {
    cardState = key;
    setBadge($("cardbadge"), n);
    $("cardtitle").textContent = title;
    $("cardsteps").innerHTML = stepsHtml(n);
  }
  const k = Math.min(easeOut(prog(age, 0, 0.35)), 1 - easeInOut(prog(age, 1.55, 1.95)));
  $("card").style.opacity = k;
  $("card").style.transform = `translate(-50%, -50%) scale(${lerp(0.94, 1, easeOut(prog(age, 0, 0.35)))})`;
  return k;
}

let captionState = "";
function showCaption(text, opacity, kind) {
  const key = `${kind ?? ""}|${text}`;
  if (captionState !== key) {
    captionState = key;
    const tag = kind === "warn" ? '<span class="tag warn">주의</span>' : kind === "note" ? '<span class="tag note">출처</span>' : "";
    $("caption").innerHTML = tag + rich(text);
  }
  $("caption").style.opacity = opacity;
  $("caption").style.transform = `translateX(-50%) translateY(${(1 - opacity) * 10}px)`;
}

// ── 처음 ─────────────────────────────────────────────────────────────
const INTRO = 7;
async function renderIntro(t) {
  for (const [sel, at] of [[".kicker", 0.5], [".title", 0.75], [".sub", 1.1]]) {
    const el = document.querySelector(`#intro ${sel}`);
    const k = easeOut(prog(t, at, at + 0.7));
    el.style.opacity = k;
    el.style.transform = `translateY(${(1 - k) * 26}px)`;
  }
  const g = games.full;
  const frame = await load(gameUrl("full", Math.floor(t * FPS) % g.frames.length));
  const ctx = $("hero").getContext("2d");
  ctx.imageSmoothingEnabled = false;
  ctx.clearRect(0, 0, 960, 720);
  // 맵의 타일 단위(게임 프레임 32px, 화면 48px)로 대각선을 따라 나타난다
  for (let r = 0; r < 15; r++) {
    for (let c = 0; c < 20; c++) {
      const k = easeOut(prog(t, 0.9 + (c + r) * 0.035, 1.25 + (c + r) * 0.035));
      if (k <= 0) continue;
      ctx.globalAlpha = k;
      const s = lerp(0.4, 1, k);
      ctx.drawImage(frame, c * 32, r * 32, 32, 32, c * 48 + (48 * (1 - s)) / 2, r * 48 + (48 * (1 - s)) / 2, 48 * s, 48 * s);
    }
  }
  ctx.globalAlpha = 1;
  $("hero").style.opacity = prog(t, 0.85, 0.9) > 0 ? 1 : 0;
}

// ── 준비: ChipSet ────────────────────────────────────────────────────
const REGIONS = {
  water: [[0, 0, 48, 64, "물 A1"], [48, 0, 48, 64, "물 A2"]],
  body: [[0, 64, 48, 64, "물 몸통"]],
  anim: [[48, 64, 16, 64, "C1"], [64, 64, 16, 64, "C2"], [80, 64, 16, 64, "C3"]],
  ground: [
    [0, 128, 48, 64, "D1"], [48, 128, 48, 64, "D2"], [0, 192, 48, 64, "D3"], [48, 192, 48, 64, "D4"],
    [96, 0, 48, 64, "D5"], [144, 0, 48, 64, "D6"], [96, 64, 48, 64, "D7"], [144, 64, 48, 64, "D8"],
    [96, 128, 48, 64, "D9"], [144, 128, 48, 64, "D10"], [96, 192, 48, 64, "D11"], [144, 192, 48, 64, "D12"],
  ],
  lower: [[192, 0, 96, 256, "E0..E95"], [288, 0, 96, 128, "E96..E143"]],
  upper: [[288, 128, 96, 128, "F0..F47"], [384, 0, 96, 256, "F48..F143"]],
};
const ALL = [0, 0, 480, 256];
const BEATS = [
  { cam: ALL, grid: true, caption: "ChipSet은 480x256 픽셀 이미지 한 장입니다. 16x16 타일이 구역마다 정해진 자리에 있습니다." },
  { cam: [0, 0, 96, 128], regions: "water", caption: "물 A1과 물 A2는 물가가 있는 물 오토타일입니다. 세로 줄 하나가 물결의 한 프레임입니다." },
  { cam: [0, 0, 96, 128], regions: "body", caption: "그 아래는 물의 몸통입니다. 얕은 물과 깊은 물이 여기에 있습니다." },
  { cam: [0, 0, 96, 128], regions: "anim", caption: "애니메이션 타일 C1, C2, C3은 위에서 아래로 네 프레임을 차례로 보입니다." },
  { cam: [0, 0, 192, 256], regions: "ground", caption: "땅 오토타일 D1에서 D12는 풀, 흙, 모래 같은 지형 12가지입니다." },
  { cam: ALL, regions: "lower", caption: "하층 타일 E0에서 E143은 오토타일이 아닌 하층 타일 144개입니다." },
  { cam: ALL, regions: "upper", caption: "상층 타일 F0에서 F143은 투명한 배경 위에 그린 나무, 울타리, 간판입니다. F0은 빈 타일입니다." },
  { cam: ALL, kind: "note", caption: "이 영상의 ChipSet은 EasyRPG RTP의 Exterior(JasonPerry, CC0)입니다." },
  { cam: ALL, kind: "warn", caption: "RPG Maker RTP의 ChipSet은 그 제품의 정품 보유자만 쓸 수 있고, 소재 자체를 따로 배포할 수 없습니다." },
];
const EXPLAIN_CARD = 2.2;
let acc = EXPLAIN_CARD;
for (const b of BEATS) {
  b.start = acc;
  b.dur = readingTime(b.caption) + 0.6;
  acc += b.dur;
}
const EXPLAIN = acc + 0.4;
const CHIP_AREA = { x: 120, y: 120, w: 1680, h: 770 };

function chipCam(box) {
  const [x, y, w, h] = box;
  const s = Math.min(CHIP_AREA.w / w, CHIP_AREA.h / h, 7);
  return { s, cx: x + w / 2, cy: y + h / 2 };
}

function renderExplain(t) {
  const ctx = $("chipcanvas").getContext("2d");
  ctx.clearRect(0, 0, W, H);
  ctx.imageSmoothingEnabled = false;
  const cardAge = t;
  let cardK = 0;
  if (cardAge < 2.0) cardK = showCard(0, "ChipSet의 구성", cardAge);
  else $("card").style.opacity = 0;
  showChip(0, "ChipSet의 구성", easeOut(prog(t, 1.8, 2.2)));

  // 카메라: 박자마다 0.9초에 걸쳐 옮긴다
  let i = BEATS.findLastIndex((b) => b.start <= t);
  let cam;
  if (i < 0) cam = chipCam(ALL);
  else {
    const prev = i > 0 ? chipCam(BEATS[i - 1].cam) : chipCam(ALL);
    const next = chipCam(BEATS[i].cam);
    const k = easeInOut(prog(t, BEATS[i].start, BEATS[i].start + 0.9));
    cam = { s: Math.exp(lerp(Math.log(prev.s), Math.log(next.s), k)), cx: lerp(prev.cx, next.cx, k), cy: lerp(prev.cy, next.cy, k) };
  }
  const ox = CHIP_AREA.x + CHIP_AREA.w / 2 - cam.cx * cam.s;
  const oy = CHIP_AREA.y + CHIP_AREA.h / 2 - cam.cy * cam.s;
  const map = (x, y) => [ox + x * cam.s, oy + y * cam.s];

  const appear = easeOut(prog(t, 0.2, 1.0));
  ctx.globalAlpha = appear * (1 - cardK * 0.6);
  // 판과 그림자
  const [x0, y0] = map(0, 0);
  ctx.fillStyle = "rgba(0,0,0,0.35)";
  ctx.fillRect(x0 + 10, y0 + 18, 480 * cam.s, 256 * cam.s);
  ctx.drawImage(chipset, x0, y0, 480 * cam.s, 256 * cam.s);

  // 격자 (첫 박자)
  const gridK = i === 0 ? easeOut(prog(t, BEATS[0].start + 0.3, BEATS[0].start + 1.2)) * (1 - prog(t, BEATS[0].start + BEATS[0].dur - 0.4, BEATS[0].start + BEATS[0].dur)) : 0;
  if (gridK > 0) {
    ctx.strokeStyle = `rgba(255,255,255,${0.35 * gridK})`;
    ctx.lineWidth = 1;
    ctx.beginPath();
    for (let gx = 0; gx <= 480; gx += 16) {
      const [a, b] = map(gx, 0);
      ctx.moveTo(Math.round(a) + 0.5, b);
      ctx.lineTo(Math.round(a) + 0.5, b + 256 * cam.s);
    }
    for (let gy = 0; gy <= 256; gy += 16) {
      const [a, b] = map(0, gy);
      ctx.moveTo(a, Math.round(b) + 0.5);
      ctx.lineTo(a + 480 * cam.s, Math.round(b) + 0.5);
    }
    ctx.stroke();
    // 크기 표시
    ctx.globalAlpha = appear * gridK;
    ctx.fillStyle = "#cfe5ff";
    ctx.font = "600 26px 'JetBrains Mono'";
    ctx.textAlign = "center";
    ctx.fillText("480 px", x0 + 240 * cam.s, y0 - 18);
    ctx.save();
    ctx.translate(x0 - 22, y0 + 128 * cam.s);
    ctx.rotate(-Math.PI / 2);
    ctx.fillText("256 px", 0, 0);
    ctx.restore();
  }
  ctx.globalAlpha = 1;

  // 구역 강조: 나머지를 어둡게 하고 테두리와 이름
  const beat = BEATS[i];
  if (beat?.regions) {
    const k = easeOut(prog(t, beat.start + 0.5, beat.start + 1.0)) * (1 - prog(t, beat.start + beat.dur - 0.25, beat.start + beat.dur));
    const regs = REGIONS[beat.regions];
    ctx.save();
    ctx.fillStyle = `rgba(6,8,12,${0.66 * k})`;
    ctx.beginPath();
    ctx.rect(0, 0, W, H);
    for (const [rx, ry, rw, rh] of regs) {
      const [a, b] = map(rx, ry);
      ctx.rect(a + rw * cam.s, b, -rw * cam.s, rh * cam.s);
    }
    ctx.fill("evenodd");
    ctx.restore();
    ctx.globalAlpha = k;
    ctx.strokeStyle = "#5aa9ff";
    ctx.lineWidth = 3;
    for (const [rx, ry, rw, rh] of regs) {
      const [a, b] = map(rx, ry);
      ctx.strokeRect(a + 1.5, b + 1.5, rw * cam.s - 3, rh * cam.s - 3);
    }
    ctx.font = "700 24px 'Pretendard Variable'";
    ctx.textAlign = "left";
    for (const [rx, ry, , , label] of regs) {
      const [a, b] = map(rx, ry);
      const tw = ctx.measureText(label).width;
      ctx.fillStyle = "rgba(10,14,20,0.9)";
      ctx.beginPath();
      ctx.roundRect(a + 8, b + 8, tw + 22, 38, 8);
      ctx.fill();
      ctx.fillStyle = "#e9f3ff";
      ctx.fillText(label, a + 19, b + 35);
    }
    ctx.globalAlpha = 1;
  }

  // 자막
  if (beat) {
    const k = Math.min(easeOut(prog(t, beat.start, beat.start + 0.25)), 1 - prog(t, EXPLAIN - 0.4, EXPLAIN - 0.1));
    showCaption(beat.caption, k, beat.kind);
  } else showCaption("", 0);
}

// ── 에디터 장면 ──────────────────────────────────────────────────────
const byType = (type) => editor.events.filter((e) => e.type === type);
const EV = {
  caption: byType("caption"),
  chapter: byType("chapter"),
  camera: byType("camera"),
  highlight: byType("highlight"),
  click: editor.events.filter((e) => e.type === "click" || e.type === "press"),
  key: byType("key"),
  drop: byType("drop"),
};
const lastAt = (list, f) => {
  let found = null;
  for (const e of list) {
    if (e.f > f) break;
    found = e;
  }
  return found;
};
const EDITOR = editor.frames.length / FPS;

// 카메라: 상자가 보이게 확대한다. 화면 밖이 너무 보이지 않게 가운데를 조인다
// 전체 보기는 1:1 이고 위쪽 장 표시 아래에서 시작한다 (자막은 아래쪽 상태 바 위에 겹친다)
const FULL = { s: 1, cx: 800, cy: 450, ax: 960, ay: 556 };
const AREA = { x: 80, y: 120, w: 1760, h: 770 };
function camTarget(e) {
  if (!e || !e.box) return FULL;
  const b = e.box;
  const s = Math.max(FULL.s, Math.min(e.maxZoom ?? 2, AREA.w / b.width, AREA.h / b.height));
  const ax = AREA.x + AREA.w / 2;
  const ay = AREA.y + AREA.h / 2;
  let cx = b.x + b.width / 2;
  let cy = b.y + b.height / 2;
  const slack = 40 / s;
  const loX = ax / s - slack;
  const hiX = 1600 - (W - ax) / s + slack;
  const loY = ay / s - slack;
  const hiY = 900 - (H - ay) / s + slack;
  cx = loX <= hiX ? clamp(cx, loX, hiX) : 800;
  cy = loY <= hiY ? clamp(cy, loY, hiY) : 450;
  return { s, cx, cy, ax, ay };
}
const CAM_DUR = 0.9 * FPS;
const mixCam = (a, b, k) => ({
  s: Math.exp(lerp(Math.log(a.s), Math.log(b.s), k)),
  cx: lerp(a.cx, b.cx, k),
  cy: lerp(a.cy, b.cy, k),
  ax: lerp(a.ax, b.ax, k),
  ay: lerp(a.ay, b.ay, k),
});
// 각 카메라 사건이 시작될 때의 상태 (앞 이동이 끝나기 전에 바뀌어도 이어진다)
{
  let state = FULL;
  let prev = null;
  for (const e of EV.camera) {
    if (prev) state = mixCam(prev.from, camTarget(prev), easeInOut(prog(e.f, prev.f, prev.f + CAM_DUR)));
    e.from = state;
    prev = e;
  }
}
function cameraAt(f) {
  const e = lastAt(EV.camera, f);
  if (!e) return FULL;
  return mixCam(e.from, camTarget(e), easeInOut(prog(f, e.f, e.f + CAM_DUR)));
}

const runs = Object.keys(games).map((name) => ({ name, start: editor.marks[`run-${name}`], end: editor.marks[`run-${name}-end`] }));

let uiUrl = "";
async function renderEditor(t) {
  const f = clamp(Math.floor(t * FPS), 0, editor.frames.length - 1);
  const [img, mx, my, down] = editor.frames[f];
  const url = DATA + "editor/ui/" + editor.images[img];
  if (url !== uiUrl) {
    const im = await load(url);
    $("ui").src = im.src;
    await $("ui").decode();
    uiUrl = url;
  }
  const cam = cameraAt(f);
  const tx = cam.ax - cam.cx * cam.s;
  const ty = cam.ay - cam.cy * cam.s;
  $("screen").style.transform = `translate(${tx}px, ${ty}px) scale(${cam.s})`;
  const toStage = (x, y) => [tx + x * cam.s, ty + y * cam.s];

  // 강조 상자 (화면 좌표)
  const marks = [];
  for (const e of EV.highlight) {
    if (e.f > f || f >= e.until) continue;
    const k = Math.min(easeOut(prog(f, e.f, e.f + 6)), 1 - prog(f, e.until - 9, e.until));
    marks.push(`<div class="hl" style="left:${e.box.x}px;top:${e.box.y}px;width:${e.box.width}px;height:${e.box.height}px;opacity:${k}"></div>`);
  }
  $("marks").innerHTML = marks.join("");

  // 커서와 누름
  const [cx, cy] = toStage(mx, my);
  $("cursor").style.transform = `translate(${cx - 3}px, ${cy - 2}px) scale(${down ? 0.9 : 1})`;
  $("press").style.opacity = down ? 1 : 0;
  $("press").style.transform = `translate(${cx}px, ${cy}px)`;
  const ripples = [];
  for (const e of EV.click) {
    const age = (f - e.f) / FPS;
    if (age < 0 || age > 0.5) continue;
    const [rx, ry] = toStage(e.x, e.y);
    const r = 8 + 30 * easeOut(age / 0.5);
    ripples.push(`<div class="ripple" style="left:${rx - r}px;top:${ry - r}px;width:${r * 2}px;height:${r * 2}px;opacity:${1 - age / 0.5}"></div>`);
  }
  $("ripples").innerHTML = ripples.join("");

  // 파일 복사
  const drop = lastAt(EV.drop, f);
  const dropAge = drop ? (f - drop.f) / FPS : 99;
  if (dropAge < 1.6) {
    const [bx, by] = toStage(drop.box.x + drop.box.width * 0.5, drop.box.y + 90);
    const k = easeInOut(prog(dropAge, 0, 1.1));
    const x = lerp(W + 40, bx - 60, k);
    const y = lerp(260, by - 30, k);
    const s = lerp(1.1, 0.7, k);
    $("drop").style.opacity = Math.min(prog(dropAge, 0, 0.2), 1 - prog(dropAge, 1.2, 1.6));
    $("drop").style.transform = `translate(${x}px, ${y}px) scale(${s})`;
  } else $("drop").style.opacity = 0;

  // 게임 창
  let gameK = 0;
  for (const run of runs) {
    if (f < run.start || f > run.end + 0.4 * FPS) continue;
    const g = games[run.name];
    const scale = g.width <= 640 ? 1.5 : 1;
    const gw = g.width * scale;
    const gh = g.height * scale;
    const canvas = $("game");
    if (canvas.width !== gw || canvas.height !== gh) {
      canvas.width = gw;
      canvas.height = gh;
    }
    const frame = await load(gameUrl(run.name, f - run.start));
    const ctx = canvas.getContext("2d");
    ctx.imageSmoothingEnabled = false;
    ctx.drawImage(frame, 0, 0, gw, gh);
    gameK = Math.min(easeOut(prog(f, run.start, run.start + 0.35 * FPS)), 1 - easeInOut(prog(f, run.end, run.end + 0.35 * FPS)));
    const winH = gh + 40;
    $("gamewin").style.width = `${gw}px`;
    $("gamewin").style.transform = `translate(${(W - gw) / 2}px, ${(H - winH) / 2 - 40}px) scale(${lerp(0.92, 1, gameK)})`;
  }
  $("gamewin").style.opacity = gameK;

  // 장 카드와 표시
  const ch = lastAt(EV.chapter, f);
  let cardK = 0;
  if (ch) {
    const age = (f - ch.f) / FPS;
    if (age < 2.0) cardK = showCard(ch.n, ch.title, age);
    else $("card").style.opacity = 0;
    showChip(ch.n, ch.title, easeOut(prog(age, 1.8, 2.2)));
  } else {
    $("card").style.opacity = 0;
    showChip(0, "", 0);
  }
  $("dim").style.opacity = Math.max(cardK, gameK * 0.75);
  $("cursor").style.opacity = 1 - Math.max(cardK, gameK);

  // 단축키
  const key = lastAt(EV.key, f);
  const keyAge = key ? (f - key.f) / FPS : 99;
  if (keyAge < 1.8) {
    const html = key.keys.map((k) => `<span class="key">${k}</span>`).join('<span class="plus">+</span>') + (key.label ? `<span class="label">${key.label}</span>` : "");
    if ($("keys").dataset.html !== html) {
      $("keys").innerHTML = html;
      $("keys").dataset.html = html;
    }
    const k = Math.min(easeOut(prog(keyAge, 0, 0.15)), 1 - prog(keyAge, 1.45, 1.8));
    $("keys").style.opacity = k;
    $("keys").style.transform = `scale(${lerp(0.85, 1, easeOut(prog(keyAge, 0, 0.15)))})`;
  } else $("keys").style.opacity = 0;

  // 자막
  const cap = lastAt(EV.caption, f);
  if (cap && cap.text) {
    showCaption(cap.text, easeOut(prog(f, cap.f, cap.f + 7)) * (1 - cardK));
  } else if (cap) {
    const before = EV.caption.filter((e) => e.f < cap.f && e.text).pop();
    showCaption(before?.text ?? "", before ? 1 - prog(f, cap.f, cap.f + 7) : 0);
  } else showCaption("", 0);
}

// ── 끝 ──────────────────────────────────────────────────────────────
const OUTRO = 11;
$("steps").innerHTML = STEPS.map((s, i) => `<li><span class="badge">${i + 1}</span><span>${s}</span></li>`).join("");
async function renderOutro(t) {
  const head = document.querySelector("#outro .head");
  head.style.opacity = easeOut(prog(t, 0.3, 0.9));
  document.querySelectorAll("#outro li").forEach((li, i) => {
    const k = easeOut(prog(t, 0.6 + i * 0.22, 1.2 + i * 0.22));
    li.style.opacity = k;
    li.style.transform = `translateX(${(1 - k) * -30}px)`;
  });
  for (const [sel, at] of [[".more", 2.6], [".credit", 3.0]]) {
    const el = document.querySelector(`#outro ${sel}`);
    el.style.opacity = easeOut(prog(t, at, at + 0.6));
  }
  const frame = await load(gameUrl("full", Math.floor((t + 3) * FPS) % games.full.frames.length));
  const ctx = $("outhero").getContext("2d");
  ctx.imageSmoothingEnabled = false;
  ctx.drawImage(frame, 0, 0, 960, 720);
  $("outhero").style.opacity = easeOut(prog(t, 0.5, 1.2));
}

// ── 시간표 ────────────────────────────────────────────────────────────
const SEGMENTS = [];
{
  let at = 0;
  for (const [id, dur, render] of [
    ["intro", INTRO, renderIntro],
    ["explain", EXPLAIN, renderExplain],
    ["editor", EDITOR, renderEditor],
    ["outro", OUTRO, renderOutro],
  ]) {
    SEGMENTS.push({ id, start: at, dur, render });
    at += dur;
  }
  window.duration = at;
}

window.seek = async (t) => {
  const seg = SEGMENTS.findLast((s) => s.start <= t) ?? SEGMENTS[0];
  const local = t - seg.start;
  for (const s of SEGMENTS) $(s.id).style.display = s === seg ? "block" : "none";
  // 장면 사이는 0.4초씩 어둡게 넘어간다
  const fade = Math.min(prog(local, 0, 0.4), 1 - prog(local, seg.dur - 0.4, seg.dur));
  $(seg.id).style.opacity = seg.id === "intro" ? Math.min(prog(local, 0, 0.8), 1 - prog(local, seg.dur - 0.4, seg.dur)) : fade;
  if (seg.id === "intro" || seg.id === "outro") {
    $("chip").style.opacity = 0;
    $("card").style.opacity = 0;
    $("keys").style.opacity = 0;
    showCaption("", 0);
  }
  await seg.render(local);
  $("hud").style.opacity = seg.id === "editor" || seg.id === "explain" ? fade : 1;
  $("black").style.opacity = seg.id === "outro" ? prog(local, seg.dur - 1.0, seg.dur) : 0;
  void document.body.offsetWidth;
  await document.fonts.ready;
};

// Pretendard 는 글자 범위마다 나뉜 파일이라, 쓰일 글자를 미리 받아 둔다 (캔버스의 글자와 나중에 나타나는 자막도)
{
  const labels = Object.values(REGIONS).flat().map((r) => r[4]);
  const text = [...EV.caption.map((e) => e.text), ...EV.chapter.map((e) => e.title), ...EV.key.map((e) => `${e.keys.join("")}${e.label ?? ""}`), ...BEATS.map((b) => b.caption), ...STEPS, ...labels, document.body.innerText, "준비주의출처ChipSet의구성0123456789px"].join(" ");
  await document.fonts.load('600 35px "Pretendard Variable"', text);
  await document.fonts.load('600 26px "JetBrains Mono"', text);
}
await document.fonts.ready;
window.ready = true;
