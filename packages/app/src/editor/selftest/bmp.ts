// 32비트 BMP 쓰기 (자가 검사가 맵 뷰에서 뽑은 타일을 logs/ 에 남긴다). 엔진의 INITIAL2D_SCREENSHOT 과 같은 꼴이라
// 판정 스크립트가 같은 읽기(tests/e2e/support/bmp.ts)로 둘을 읽는다: BITMAPV4HEADER, BI_BITFIELDS, 알파 마스크 있음,
// 위에서 아래(높이 음수). 입력은 RGBA 순서의 바이트다.

const FILE_HEADER = 14;
const V4_HEADER = 108;
const BI_BITFIELDS = 3;

export function encodeBmp32(width: number, height: number, rgba: ArrayLike<number>): Uint8Array {
  if (!Number.isInteger(width) || !Number.isInteger(height) || width <= 0 || height <= 0) throw new Error(`잘못된 크기: ${width}x${height}`);
  if (rgba.length !== width * height * 4) throw new Error(`픽셀 수 불일치: ${rgba.length} (필요 ${width * height * 4})`);
  const dataOffset = FILE_HEADER + V4_HEADER;
  const size = dataOffset + width * height * 4;
  const out = new Uint8Array(size);
  const view = new DataView(out.buffer);
  out[0] = 0x42; // B
  out[1] = 0x4d; // M
  view.setUint32(2, size, true);
  view.setUint32(10, dataOffset, true);
  view.setUint32(14, V4_HEADER, true);
  view.setInt32(18, width, true);
  view.setInt32(22, -height, true);
  view.setUint16(26, 1, true);
  view.setUint16(28, 32, true);
  view.setUint32(30, BI_BITFIELDS, true);
  view.setUint32(34, width * height * 4, true);
  view.setInt32(38, 2835, true);
  view.setInt32(42, 2835, true);
  view.setUint32(54, 0x00ff0000, true); // R
  view.setUint32(58, 0x0000ff00, true); // G
  view.setUint32(62, 0x000000ff, true); // B
  view.setUint32(66, 0xff000000, true); // A
  view.setUint32(70, 0x73524742, true); // LCS_sRGB ("sRGB")
  for (let i = 0, o = dataOffset; i < width * height; i++, o += 4) {
    out[o] = rgba[i * 4 + 2];
    out[o + 1] = rgba[i * 4 + 1];
    out[o + 2] = rgba[i * 4];
    out[o + 3] = rgba[i * 4 + 3];
  }
  return out;
}
