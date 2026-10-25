// 에디터 화면을 영상의 프레임 단위로 찍는다 (docs/tutorial-video.md).
//
// 페이지의 시계(Date, setTimeout, requestAnimationFrame, performance)를 Playwright 의 가짜 시계로 바꾸고 멈춘 채,
// 프레임마다 정확히 1/fps 초씩 나아가게 한 뒤 찍는다. 그래서 맵 뷰의 물결과 툴팁 지연이 찍는 속도와 상관없이 영상 시간으로
// 맞고, 같은 대본은 늘 같은 프레임이 나온다. 마우스 커서는 화면에 그려지지 않으므로 위치만 남기고 합성 단계가 그린다.
//
// 산출물 (dir):
//   ui/00000.png ...   화면 그림. 같은 그림은 한 장만 쓴다
//   timeline.json      { fps, width, height, scale, images, frames: [[그림 번호, 커서 x, 커서 y, 눌림]], events, marks }

import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";

const easeInOut = (t) => (t < 0.5 ? 4 * t * t * t : 1 - (-2 * t + 2) ** 3 / 2);

export class Recorder {
  constructor(page, cdp, dir, { fps = 30, width, height, scale = 2 }) {
    Object.assign(this, { page, cdp, dir, fps, width, height, scale });
    this.frames = [];
    this.events = [];
    this.marks = {};
    this.images = [];
    this.hashes = new Map();
    this.cursor = { x: width * 0.5, y: height * 0.5, down: false };
    this.clockMs = 0;
    this.captionAt = -1;
    this.captionMin = 0;
    fs.rmSync(path.join(dir, "ui"), { recursive: true, force: true });
    fs.mkdirSync(path.join(dir, "ui"), { recursive: true });
  }

  /** 지금까지 찍은 길이(초) */
  get time() {
    return this.frames.length / this.fps;
  }

  /** 시계를 멈춘다. 이 뒤로 페이지의 시간은 frame() 으로만 흐른다 */
  async start() {
    const now = await this.page.evaluate(() => Date.now());
    this.baseNow = now + 1000;
    await this.page.clock.pauseAt(this.baseNow);
    this.startedAt = Date.now();
  }

  /**
   * 페이지 시계를 ms 만큼 나아가게 한다. 타이머 콜백이 던진 오류는 가짜 시계가 runFor 로 다시 던지므로(진짜 브라우저는 콘솔에만
   * 남긴다), 남기고 나머지 시간을 마저 돌린다. 예: 가짜 performance 의 measure() 는 값을 돌려주지 않는다
   */
  async advance(ms) {
    const target = this.baseNow + this.clockMs + ms;
    for (let tries = 0; tries < 20; tries++) {
      const now = tries === 0 ? target - ms : await this.page.evaluate(() => Date.now());
      if (now >= target) return;
      try {
        await this.page.clock.runFor(target - now);
        return;
      } catch (e) {
        if (!this.warned?.has(e.message)) {
          (this.warned ??= new Set()).add(e.message);
          console.warn(`  페이지 타이머 오류 (무시): ${e.message.split("\n")[0]}`);
        }
      }
    }
  }

  /** 1/fps 초 나아가고 한 장 찍는다 */
  async frame() {
    const next = Math.round(((this.frames.length + 1) * 1000) / this.fps);
    await this.advance(next - this.clockMs);
    this.clockMs = next;
    if (this.dry) {
      this.frames.push([0, 0, 0, 0]);
      return;
    }
    const { data } = await this.cdp.send("Page.captureScreenshot", {
      format: "png",
      optimizeForSpeed: true,
      clip: { x: 0, y: 0, width: this.width, height: this.height, scale: this.scale },
    });
    const hash = crypto.createHash("sha1").update(data).digest("hex");
    let index = this.hashes.get(hash);
    if (index === undefined) {
      index = this.images.length;
      const name = `${String(index).padStart(5, "0")}.png`;
      fs.writeFileSync(path.join(this.dir, "ui", name), Buffer.from(data, "base64"));
      this.images.push(name);
      this.hashes.set(hash, index);
    }
    this.frames.push([index, Math.round(this.cursor.x * 10) / 10, Math.round(this.cursor.y * 10) / 10, this.cursor.down ? 1 : 0]);
    if (this.frames.length % 300 === 0) {
      this.startedAt ??= Date.now();
      console.log(`  ${this.frames.length} 프레임 (${this.time.toFixed(0)}초), 그림 ${this.images.length}장, ${((Date.now() - this.startedAt) / 1000).toFixed(0)}초 걸림`);
    }
  }

  async hold(seconds) {
    const n = Math.max(1, Math.round(seconds * this.fps));
    for (let i = 0; i < n; i++) await this.frame();
  }

  /** 조건이 참이 될 때까지 찍으며 기다린다 (조건이 시계에 기대도 된다) */
  async until(check, { timeout = 20, what = "조건" } = {}) {
    const limit = this.frames.length + timeout * this.fps;
    while (!(await check())) {
      if (this.frames.length > limit) {
        await this.page.screenshot({ path: path.join(this.dir, "until-failed.png") }).catch(() => {});
        throw new Error(`${what}: ${timeout}초 안에 되지 않았다 (화면: until-failed.png)`);
      }
      await this.frame();
    }
  }

  event(type, data = {}) {
    this.events.push({ f: this.frames.length, type, ...data });
  }

  mark(name) {
    this.marks[name] = this.frames.length;
  }

  /** 자막. 앞 자막을 읽을 시간이 지나기 전이면 그만큼 기다린 뒤 바꾼다 */
  async say(text, { min } = {}) {
    await this.waitCaption();
    this.event("caption", { text });
    this.captionAt = this.frames.length;
    this.captionMin = min ?? readingTime(text);
  }

  async waitCaption() {
    if (this.captionAt < 0) return;
    const left = this.captionAt + Math.round(this.captionMin * this.fps) - this.frames.length;
    if (left > 0) await this.hold(left / this.fps);
  }

  clearCaption() {
    this.event("caption", { text: "" });
    this.captionAt = -1;
  }

  /** 카메라: 화면 좌표의 상자(css px)나 "full". 합성 단계가 이 상자가 보이게 확대한다 */
  camera(box, { pad = 24, maxZoom } = {}) {
    this.event("camera", box === "full" ? { box: null } : { box: inflate(box, pad), maxZoom });
  }

  /** 강조 상자 */
  highlight(box, { seconds = 2, label, pad = 4 } = {}) {
    this.event("highlight", { box: inflate(box, pad), until: this.frames.length + Math.round(seconds * this.fps), label });
  }

  async moveTo(x, y, seconds) {
    const from = { ...this.cursor };
    const dist = Math.hypot(x - from.x, y - from.y);
    const dur = seconds ?? Math.min(0.9, 0.3 + dist / 1600);
    const n = Math.max(1, Math.round(dur * this.fps));
    for (let i = 1; i <= n; i++) {
      const k = easeInOut(i / n);
      this.cursor.x = from.x + (x - from.x) * k;
      this.cursor.y = from.y + (y - from.y) * k;
      await this.page.mouse.move(this.cursor.x, this.cursor.y);
      await this.frame();
    }
  }

  async moveToBox(box, seconds) {
    await this.moveTo(box.x + box.width / 2, box.y + box.height / 2, seconds);
  }

  async click(x, y, { after = 0.3, button = "left", count = 1 } = {}) {
    await this.moveTo(x, y);
    await this.hold(0.12);
    for (let i = 0; i < count; i++) {
      this.cursor.down = true;
      this.event("click", { x, y, button });
      await this.page.mouse.down({ button, clickCount: i + 1 });
      await this.frame();
      await this.frame();
      this.cursor.down = false;
      await this.page.mouse.up({ button, clickCount: i + 1 });
      await this.frame();
    }
    if (after > 0) await this.hold(after);
  }

  async clickBox(box, opts) {
    await this.click(box.x + box.width / 2, box.y + box.height / 2, opts);
  }

  /** 누르는 모습만 남긴다. <select> 처럼 눌러 열면 브라우저의 팝업이 입력을 가로채는 곳에 쓰고, 값은 따로 바꾼다 */
  async pretendClick(box, { after = 0.2 } = {}) {
    const x = box.x + box.width / 2;
    const y = box.y + box.height / 2;
    await this.moveTo(x, y);
    await this.hold(0.12);
    this.cursor.down = true;
    this.event("click", { x, y, button: "left" });
    await this.frame();
    await this.frame();
    this.cursor.down = false;
    await this.frame();
    if (after > 0) await this.hold(after);
  }

  /** 누른 채 끈다. 지나는 점을 여럿 주면 차례로 간다 */
  async drag(points, { seconds, after = 0.3, button = "left" } = {}) {
    const [first, ...rest] = points;
    await this.moveTo(first.x, first.y);
    await this.hold(0.12);
    this.cursor.down = true;
    this.event("press", { x: first.x, y: first.y, button });
    await this.page.mouse.down({ button });
    await this.frame();
    const each = seconds ? seconds / rest.length : undefined;
    for (const p of rest) await this.moveTo(p.x, p.y, each);
    await this.hold(0.1);
    this.cursor.down = false;
    this.event("release", { x: this.cursor.x, y: this.cursor.y, button });
    await this.page.mouse.up({ button });
    await this.frame();
    if (after > 0) await this.hold(after);
  }

  /** 단축키. keys 는 화면에 보일 이름 (["Ctrl", "Z"]), combo 는 Playwright 표기 */
  async key(combo, { keys, label, after = 0.4 } = {}) {
    this.event("key", { keys: keys ?? combo.split("+"), label });
    await this.page.keyboard.press(combo);
    await this.frame();
    if (after > 0) await this.hold(after);
  }

  /** 글자를 한 자씩 친다 */
  async type(text, { cps = 12, after = 0.3 } = {}) {
    const per = Math.max(1, Math.round(this.fps / cps));
    for (const ch of text) {
      await this.page.keyboard.type(ch);
      for (let i = 0; i < per; i++) await this.frame();
    }
    if (after > 0) await this.hold(after);
  }

  save(extra = {}) {
    const out = {
      fps: this.fps,
      width: this.width,
      height: this.height,
      scale: this.scale,
      images: this.images,
      frames: this.frames,
      events: this.events,
      marks: this.marks,
      ...extra,
    };
    fs.writeFileSync(path.join(this.dir, "timeline.json"), JSON.stringify(out));
    return out;
  }
}

/** 자막을 읽는 데 드는 시간(초). 한국어 기준 1초에 9자, 짧아도 2.2초. **굵게** 와 `코드` 표시는 세지 않는다 */
export function readingTime(text) {
  const chars = [...text.replace(/\*\*|`|\s+/g, "")].length;
  return Math.max(2.2, 0.9 + chars / 9);
}

export function inflate(box, pad) {
  return { x: box.x - pad, y: box.y - pad, width: box.width + pad * 2, height: box.height + pad * 2 };
}

export function union(...boxes) {
  const x0 = Math.min(...boxes.map((b) => b.x));
  const y0 = Math.min(...boxes.map((b) => b.y));
  const x1 = Math.max(...boxes.map((b) => b.x + b.width));
  const y1 = Math.max(...boxes.map((b) => b.y + b.height));
  return { x: x0, y: y0, width: x1 - x0, height: y1 - y0 };
}
