// 게임 뷰 canvas 의 크기 맞춤과 정리와 픽셀 검사.

import type { EngineModule } from "./engineAssets";

/**
 * 패널 안에 게임 화면을 놓을 배율. 들어가면 정수 배율(1, 2, 3...)로 키우고,
 * 패널이 게임 창보다 작으면 비율을 지켜 줄인다 (소수 배율).
 */
export function fitScale(available: { width: number; height: number }, game: { width: number; height: number }): number {
  if (game.width <= 0 || game.height <= 0 || available.width <= 0 || available.height <= 0) return 1;
  const ratio = Math.min(available.width / game.width, available.height / game.height);
  if (ratio >= 1) return Math.floor(ratio);
  return Math.max(0.1, Math.floor(ratio * 100) / 100);
}

/** 이번 프레임에 그린 것을 읽는다. 엔진의 requestAnimationFrame 뒤에 불려야 WebGL 버퍼가 남아 있다 */
export interface CanvasStats {
  width: number;
  height: number;
  /** 가장 많은 색 (배경으로 본다) 의 비율 */
  dominantShare: number;
  /** 가장 많은 색이 아닌 픽셀 수 */
  nonBackground: number;
  /** 서로 다른 색의 수 (1000 에서 자른다) */
  distinctColors: number;
  /** 화면을 GRID x GRID 칸으로 나눈 칸별 평균 밝기 (0 ~ 255). 두 화면이 얼마나 다른지 잴 때 쓴다 */
  grid: number[];
}

export const STATS_GRID = 16;

export function pixelStats(data: Uint8ClampedArray, width: number, height: number): CanvasStats {
  const counts = new Map<number, number>();
  const total = width * height;
  const sums = new Array<number>(STATS_GRID * STATS_GRID).fill(0);
  const cells = new Array<number>(STATS_GRID * STATS_GRID).fill(0);
  for (let y = 0; y < height; y++) {
    const row = Math.min(STATS_GRID - 1, Math.floor((y * STATS_GRID) / height)) * STATS_GRID;
    for (let x = 0; x < width; x++) {
      const o = (y * width + x) * 4;
      const key = ((data[o] << 16) | (data[o + 1] << 8) | data[o + 2]) >>> 0;
      counts.set(key, (counts.get(key) ?? 0) + 1);
      const cell = row + Math.min(STATS_GRID - 1, Math.floor((x * STATS_GRID) / width));
      sums[cell] += (data[o] * 299 + data[o + 1] * 587 + data[o + 2] * 114) / 1000;
      cells[cell]++;
    }
  }
  let dominant = 0;
  for (const n of counts.values()) dominant = Math.max(dominant, n);
  return {
    width,
    height,
    dominantShare: total ? dominant / total : 0,
    nonBackground: total - dominant,
    distinctColors: Math.min(counts.size, 1000),
    grid: sums.map((sum, i) => (cells[i] ? Math.round(sum / cells[i]) : 0)),
  };
}

/** 두 통계의 칸별 밝기 차이 평균 (0 ~ 255) */
export function gridDifference(a: CanvasStats, b: CanvasStats): number {
  const n = Math.min(a.grid.length, b.grid.length);
  if (n === 0) return 0;
  let sum = 0;
  for (let i = 0; i < n; i++) sum += Math.abs(a.grid[i] - b.grid[i]);
  return sum / n;
}

/** 다음 애니메이션 프레임에서 canvas 를 2D 로 복사해 통계를 낸다 (엔진이 그린 직후) */
export function captureCanvasStats(canvas: HTMLCanvasElement): Promise<CanvasStats> {
  return new Promise((resolve, reject) => {
    requestAnimationFrame(() => {
      try {
        const copy = document.createElement("canvas");
        copy.width = canvas.width;
        copy.height = canvas.height;
        const ctx = copy.getContext("2d");
        if (!ctx) throw new Error("2D 컨텍스트를 만들지 못했다");
        ctx.drawImage(canvas, 0, 0);
        const image = ctx.getImageData(0, 0, copy.width, copy.height);
        resolve(pixelStats(image.data, copy.width, copy.height));
      } catch (e) {
        reject(e as Error);
      }
    });
  });
}

type GlLike = { getExtension?: (name: string) => { loseContext?: () => void } | null };

/** WebGL 컨텍스트와 오디오를 바로 돌려주고 canvas 를 문서에서 뗀다 (GC 를 기다리지 않는다) */
export function releaseEngineResources(canvas: HTMLCanvasElement | null, module: EngineModule | null): void {
  const fromCanvas = (canvas as unknown as { GLctxObject?: { GLctx?: GlLike } } | null)?.GLctxObject?.GLctx;
  const gl = (module?.ctx as GlLike | undefined) ?? fromCanvas;
  try {
    gl?.getExtension?.("WEBGL_lose_context")?.loseContext?.();
  } catch {
    // 이미 잃은 컨텍스트다
  }
  const audio = module?.SDL2?.audioContext;
  if (audio && audio.state !== "closed") void audio.close().catch(() => {});
  canvas?.remove();
}
