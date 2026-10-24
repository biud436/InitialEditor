// 검사용 ChipSet. 픽셀마다 색이 그 픽셀이 든 8x8 조각의 자리다 (R = x / 8, G = y / 8, B = 200). 구운 아틀라스나 엔진 화면의
// 조각 가운데를 읽으면 그 조각이 ChipSet 의 어디서 왔는지 안다. RTP 그림은 저장소에 넣지 않으므로 검사는 이 그림으로 한다.

import type { RgbaImage } from "@initial-editor/core";
import { CHIPSET_HEIGHT, CHIPSET_WIDTH, HALF } from "./chipset";

export const CODED_BLUE = 200;

export function codedChipset(): RgbaImage {
  const data = new Uint8Array(CHIPSET_WIDTH * CHIPSET_HEIGHT * 4);
  for (let y = 0; y < CHIPSET_HEIGHT; y++) {
    for (let x = 0; x < CHIPSET_WIDTH; x++) {
      const o = (y * CHIPSET_WIDTH + x) * 4;
      data[o] = Math.floor(x / HALF);
      data[o + 1] = Math.floor(y / HALF);
      data[o + 2] = CODED_BLUE;
      data[o + 3] = 255;
    }
  }
  return { width: CHIPSET_WIDTH, height: CHIPSET_HEIGHT, data };
}

/** 그림의 (x, y) 를 둘러싼 조각이 온 ChipSet 조각 자리. 검사용 색이 아니면 null */
export function codedQuarterAt(image: RgbaImage, x: number, y: number): { qx: number; qy: number } | null {
  const o = (y * image.width + x) * 4;
  if (image.data[o + 3] === 0 || Math.abs(image.data[o + 2] - CODED_BLUE) > 2) return null;
  return { qx: image.data[o], qy: image.data[o + 1] };
}
