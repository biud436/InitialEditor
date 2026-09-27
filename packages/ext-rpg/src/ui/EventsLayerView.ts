// 이벤트 레이어의 그림 (e5 문서 3절 "그리기"). 앱의 MapRenderer 가 준 Container(월드 좌표)에 그린다.
//   외형이 있으면 CharSet 의 서 있는 프레임 (그림을 읽기 전과 읽지 못했으면 표식)
//   외형이 없으면 칸 크기의 표식과 트리거 글자. 색은 테마 토큰 (accent, warning, success, fg-muted)
//   고른 이벤트는 테두리, 배회 구역이 있으면 옅은 사각형과 굵은 가장자리 (도구가 가장자리를 끈다)
//   오류나 경고가 있는 이벤트는 칸 오른쪽 위에 점
//   끄는 중이면 미리보기: 옮길 자리(놓을 수 없으면 danger), 상자 선택, 구역 크기
// 레이어 눈과 흐리기는 앱이 맡는다. 문서와 상태가 바뀌면 MobX 반응으로 다시 그린다.

import type { MapLayerView, MapLayerViewContext } from "@initial-editor/ext-tilemap";
import { autorun, observable, runInAction } from "mobx";
import { Container, Graphics, Rectangle, Sprite, Text, Texture, type TextureSource } from "pixi.js";
import type { Rect } from "../model/assets";
import { eventsStateOf, type EventsLayerState } from "../model/layer";
import type { EventProblem } from "../model/validate";
import { eventMarkers, wanderArea, type EventMarker } from "./markers";

interface Sheet {
  status: "loading" | "ready" | "failed";
  source?: TextureSource;
  width: number;
  height: number;
}

export interface EventsLayerViewDeps {
  /** 프로젝트 파일이 있는가 (외형의 후보 고르기). 모르면 null */
  fileExists(): ((projectPath: string) => boolean) | null;
}

/** 테스트와 도구가 보는 그린 표식 하나 */
export interface DrawnMarker {
  index: number;
  kind: "sprite" | "badge";
  /** 월드 픽셀 */
  x: number;
  y: number;
  sheet?: string;
  frame?: Rect;
}

export class EventsLayerView implements MapLayerView {
  private readonly root: Container;
  private readonly areaG = new Graphics();
  private readonly badgeG = new Graphics();
  private readonly markerRoot = new Container();
  private readonly overlayG = new Graphics();
  private readonly previewG = new Graphics();
  private readonly sheets = new Map<string, Sheet>();
  private readonly frames = new Map<string, Texture>();
  /** 그림을 읽을 때마다 오른다 (다시 그리기) */
  private readonly loads = observable.box(0);
  private readonly zoomTick = observable.box(0);
  private stop: (() => void) | null = null;
  private disposed = false;
  /** 마지막으로 그린 표식 */
  drawn: DrawnMarker[] = [];

  constructor(
    private readonly ctx: MapLayerViewContext,
    private readonly deps: EventsLayerViewDeps,
  ) {
    this.root = ctx.container as Container;
    this.markerRoot.label = "rpg-events-markers";
    this.root.addChild(this.areaG, this.badgeG, this.markerRoot, this.overlayG, this.previewG);
    this.stop = autorun(() => this.draw());
  }

  redraw(): void {
    runInAction(() => this.zoomTick.set(this.zoomTick.get() + 1));
  }

  dispose(): void {
    this.disposed = true;
    this.stop?.();
    this.stop = null;
    this.clearMarkers();
    for (const t of this.frames.values()) t.destroy(false);
    this.frames.clear();
    this.sheets.clear();
  }

  private get state(): EventsLayerState | null {
    return eventsStateOf(this.ctx.document);
  }

  private clearMarkers(): void {
    for (const c of this.markerRoot.removeChildren()) c.destroy();
  }

  /** 시트를 읽기 시작한다 (한 번만). 읽고 나면 다시 그린다 */
  private sheet(path: string): Sheet {
    let s = this.sheets.get(path);
    if (s) return s;
    s = { status: "loading", width: 0, height: 0 };
    this.sheets.set(path, s);
    const entry = s;
    this.ctx.loadTexture(path).then(
      (t) => {
        if (this.disposed) return;
        entry.status = "ready";
        entry.source = (t.texture as { source: TextureSource }).source;
        entry.width = t.width;
        entry.height = t.height;
        runInAction(() => this.loads.set(this.loads.get() + 1));
      },
      () => {
        if (this.disposed) return;
        entry.status = "failed";
        runInAction(() => this.loads.set(this.loads.get() + 1));
      },
    );
    return s;
  }

  private frameTexture(path: string, sheet: Sheet, frame: Rect): Texture | null {
    if (sheet.status !== "ready" || !sheet.source) return null;
    if (frame.x < 0 || frame.y < 0 || frame.x + frame.w > sheet.width || frame.y + frame.h > sheet.height) return null;
    const key = `${path}|${frame.x},${frame.y},${frame.w},${frame.h}`;
    let t = this.frames.get(key);
    if (!t) {
      t = new Texture({ source: sheet.source, frame: new Rectangle(frame.x, frame.y, frame.w, frame.h) });
      this.frames.set(key, t);
    }
    return t;
  }

  private draw(): void {
    void this.loads.get();
    void this.zoomTick.get();
    const st = this.state;
    for (const g of [this.areaG, this.badgeG, this.overlayG, this.previewG]) g.clear();
    this.clearMarkers();
    this.drawn = [];
    if (!st) return;
    const model = this.ctx.document.model;
    void model.revision;
    const tw = model.tileWidth;
    const th = model.tileHeight;
    const zoom = Math.max(0.01, this.ctx.zoom());
    const line = 1 / zoom;
    const list = st.section.list;
    const markers = eventMarkers(list, { schema: st.schema, tileWidth: tw, tileHeight: th, fileExists: this.deps.fileExists() });
    const selected = new Set(st.selected);
    const byIndex = new Map<number, EventMarker>();
    for (const m of markers) byIndex.set(m.index, m);

    // 고른 이벤트의 배회 구역
    const areaColor = this.ctx.color("accent");
    for (const i of selected) {
      const area = wanderArea(list[i]);
      if (!area) continue;
      const r = { x: area.x * tw, y: area.y * th, w: area.w * tw, h: area.h * th };
      this.areaG.rect(r.x, r.y, r.w, r.h).fill({ color: areaColor, alpha: 0.1 }).stroke({ color: areaColor, width: 2 * line, alpha: 0.9 });
    }

    // 표식
    const fontFamily = this.ctx.font("font-ui");
    const textColor = this.ctx.color("fg");
    for (const m of markers) {
      const texture = m.sprite ? this.frameTexture(m.sprite.sheet, this.sheet(m.sprite.sheet), m.sprite.frame) : null;
      if (m.sprite && texture) {
        const sprite = new Sprite(texture);
        sprite.label = `event:${m.index}`;
        sprite.position.set(m.rect.x, m.rect.y);
        this.markerRoot.addChild(sprite);
        this.drawn.push({ index: m.index, kind: "sprite", x: m.rect.x, y: m.rect.y, sheet: m.sprite.sheet, frame: m.sprite.frame });
        continue;
      }
      const color = this.ctx.color(m.badge.token);
      const c = m.cellRect;
      const inset = Math.min(2, c.w / 8);
      this.badgeG
        .roundRect(c.x + inset, c.y + inset, c.w - inset * 2, c.h - inset * 2, Math.min(4, c.w / 4))
        .fill({ color, alpha: 0.35 })
        .stroke({ color, width: line, alpha: 1 });
      const letter = new Text({ text: m.badge.letter, style: { fontFamily, fontSize: Math.round(c.h * 0.62), fill: textColor, fontWeight: "bold" } });
      letter.label = `event:${m.index}`;
      letter.resolution = Math.min(8, Math.max(1, zoom) * (typeof window !== "undefined" ? window.devicePixelRatio || 1 : 1));
      letter.anchor.set(0.5);
      letter.position.set(c.x + c.w / 2, c.y + c.h / 2);
      this.markerRoot.addChild(letter);
      this.drawn.push({ index: m.index, kind: "badge", x: c.x, y: c.y });
    }

    // 문제 점과 고른 테두리
    const worst = worstByEvent(st.eventProblems);
    const dot = Math.max(2, tw / 6);
    for (const m of markers) {
      const sev = worst.get(m.index);
      if (sev) this.overlayG.circle(m.cellRect.x + m.cellRect.w - dot, m.cellRect.y + dot, dot).fill({ color: this.ctx.color(sev === "error" ? "danger" : "warning"), alpha: 1 });
    }
    const selColor = this.ctx.color("scene-selection");
    for (const i of selected) {
      const m = byIndex.get(i);
      if (!m) continue;
      const r = union(m.rect, m.cellRect);
      this.overlayG.rect(r.x - line, r.y - line, r.w + 2 * line, r.h + 2 * line).stroke({ color: selColor, width: 2 * line, alpha: 1 });
    }

    // 끄는 중의 미리보기
    const drag = st.drag;
    if (drag?.kind === "move") {
      const color = this.ctx.color(drag.ok ? "scene-selection" : "danger");
      for (const i of drag.indices) {
        const m = byIndex.get(i);
        if (!m) continue;
        const r = union(m.rect, m.cellRect);
        this.previewG.rect(r.x + drag.dx * tw, r.y + drag.dy * th, r.w, r.h).fill({ color, alpha: 0.2 }).stroke({ color, width: 2 * line, alpha: 1 });
        const area = drag.keepArea ? null : wanderArea(list[i]);
        if (area) this.previewG.rect((area.x + drag.dx) * tw, (area.y + drag.dy) * th, area.w * tw, area.h * th).stroke({ color, width: line, alpha: 0.8 });
      }
    } else if (drag?.kind === "box") {
      const x0 = Math.min(drag.from.x, drag.to.x);
      const y0 = Math.min(drag.from.y, drag.to.y);
      const x1 = Math.max(drag.from.x, drag.to.x) + 1;
      const y1 = Math.max(drag.from.y, drag.to.y) + 1;
      this.previewG.rect(x0 * tw, y0 * th, (x1 - x0) * tw, (y1 - y0) * th).fill({ color: selColor, alpha: 0.08 }).stroke({ color: selColor, width: line, alpha: 1 });
    } else if (drag?.kind === "area") {
      const color = this.ctx.color(drag.ok ? "accent" : "danger");
      const a = drag.area;
      this.previewG.rect(a.x * tw, a.y * th, a.w * tw, a.h * th).fill({ color, alpha: 0.12 }).stroke({ color, width: 2 * line, alpha: 1 });
    }
  }
}

function union(a: Rect, b: Rect): Rect {
  const x = Math.min(a.x, b.x);
  const y = Math.min(a.y, b.y);
  return { x, y, w: Math.max(a.x + a.w, b.x + b.w) - x, h: Math.max(a.y + a.h, b.y + b.h) - y };
}

/** 이벤트마다 가장 무거운 문제 (정보는 표식 없이 인스펙터에만) */
function worstByEvent(problems: readonly EventProblem[]): Map<number, "error" | "warning"> {
  const out = new Map<number, "error" | "warning">();
  for (const p of problems) {
    if (p.eventIndex === undefined || p.severity === "info") continue;
    if (p.severity === "error" || !out.has(p.eventIndex)) out.set(p.eventIndex, p.severity);
  }
  return out;
}
