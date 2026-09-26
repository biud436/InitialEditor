// 내용 해시 (FNV-1a 32비트와 길이). 감시가 "이 변경이 내가 쓴 것인가" 를 가리는 데만 쓴다.

export function hashBytes(data: Uint8Array): string {
  let h = 0x811c9dc5;
  for (let i = 0; i < data.length; i++) {
    h ^= data[i];
    h = Math.imul(h, 0x01000193);
  }
  return `${(h >>> 0).toString(16)}:${data.length}`;
}
