// 외형과 얼굴 (엔진 M2 2.2 의 assets 와 sheets, scripts/lua/rpg/assets.lua, specs.lua).
//
// 이벤트는 그림을 논리 이름 { set: "npc", index: 6 } 이나 파일 { file, index } 로 적는다. 논리 이름은 스키마의 후보 중
// 프로젝트에 있는 첫 파일로 푼다 (엔진 Assets.pick 과 같은 규칙: RTP 가 있으면 RTP, 없으면 플레이스홀더).
// 그리기는 CharSet 의 서 있는 프레임(standPattern 열, 방향 행)과 FaceSet 의 칸이고, 자리는 게임과 같다
// (가로는 칸 가운데, 발이 칸 아래 변. character.lua 의 pixelPos).

import { field, isInteger } from "./json";
import { bareProjectPath } from "./game";
import type { AssetKind, EventSchema } from "./schema";

export interface Rect {
  x: number;
  y: number;
  w: number;
  h: number;
}

export interface ResolveOptions {
  /** 거짓이면 RTP 후보를 보지 않는다 (INITIAL2D_NO_RTP, 내장 실행의 스테이징) */
  rtp?: boolean;
}

export function isRtpPath(path: string): boolean {
  return bareProjectPath(path).includes("/rtp/") || bareProjectPath(path).startsWith("rtp/");
}

/**
 * 외형이나 얼굴 참조를 프로젝트 기준 경로(./ 없이)로 푼다. 논리 이름은 후보 중 있는 첫 파일, 다 없으면 마지막 후보.
 * 모르는 이름이나 틀린 참조는 null
 */
export function resolveAssetFile(schema: EventSchema, kind: AssetKind, ref: unknown, exists: (projectPath: string) => boolean, opts: ResolveOptions = {}): string | null {
  const file = field(ref, "file");
  if (typeof file === "string" && file !== "") return bareProjectPath(file);
  const set = field(ref, "set");
  if (typeof set !== "string") return null;
  const candidates = schema.assets[kind].get(set);
  if (!candidates || candidates.length === 0) return null;
  const allowRtp = opts.rtp !== false;
  for (const c of candidates) {
    const p = bareProjectPath(c);
    if ((allowRtp || !isRtpPath(p)) && exists(p)) return p;
  }
  return bareProjectPath(candidates[candidates.length - 1]);
}

/** 참조의 번호 (없거나 틀리면 0, 엔진이 0 으로 본다) */
export function assetIndex(ref: unknown): number {
  const index = field(ref, "index");
  return isInteger(index) && index >= 0 ? index : 0;
}

/** CharSet 한 장에서 index 번째 캐릭터의 서 있는 프레임. dir 이 없거나 모르면 정면(down) */
export function charsetFrame(schema: EventSchema, index: number, dir?: string): Rect {
  const c = schema.sheets.charset;
  const rows = Object.keys(c.dirRows).length;
  const blockW = c.patterns * c.frameW;
  const blockH = rows * c.frameH;
  const i = Math.min(Math.max(0, Math.trunc(index)), c.perSheet - 1);
  const row = (dir !== undefined ? c.dirRows[dir] : undefined) ?? c.dirRows.down ?? 0;
  return {
    x: (i % c.sheetCols) * blockW + c.standPattern * c.frameW,
    y: Math.floor(i / c.sheetCols) * blockH + row * c.frameH,
    w: c.frameW,
    h: c.frameH,
  };
}

/** FaceSet 한 장에서 index 번째 얼굴 */
export function faceRect(schema: EventSchema, index: number): Rect {
  const f = schema.sheets.face;
  const i = Math.min(Math.max(0, Math.trunc(index)), f.perSheet - 1);
  return { x: (i % f.cols) * f.size, y: Math.floor(i / f.cols) * f.size, w: f.size, h: f.size };
}

/** 칸 (tx, ty) 에 선 캐릭터 프레임의 왼쪽 위 (월드 픽셀). 발이 칸 아래 변이라 프레임이 윗 칸으로 올라간다 */
export function characterDrawPos(schema: EventSchema, tileW: number, tileH: number, tx: number, ty: number): { x: number; y: number } {
  const c = schema.sheets.charset;
  return { x: tx * tileW + (tileW - c.frameW) / 2, y: (ty + 1) * tileH - c.frameH };
}
