// 이벤트 클립보드. 확장 안에 따로 둔다 (씬의 tools.clipboard 나 커맨드 클립보드와 섞이지 않는다, e5 문서 2.4).
// 담는 것은 이벤트 배열의 JSON 글이고, 시스템 클립보드에도 같은 글을 적어 둔다 (텍스트 편집기에 붙일 수 있다).
// 2^53을 넘는 정수는 맵 파일처럼 숫자 그대로 쓰고 읽는다 (parseJsonLossless, stringifyJsonLossless).

import { isPlainObject, parseJsonLossless, stringifyJsonLossless } from "../model/json";

interface SystemClipboard {
  writeText(text: string): Promise<void>;
}

function systemClipboard(): SystemClipboard | null {
  try {
    return typeof navigator !== "undefined" && navigator.clipboard ? navigator.clipboard : null;
  } catch {
    return null;
  }
}

/** 이벤트 JSON 글을 읽는다: 이벤트 객체(x, y 가 있는)의 배열이나 하나. 아니면 null */
export function parseEventsJson(text: string | null): unknown[] | null {
  if (text === null) return null;
  let v: unknown;
  try {
    v = parseJsonLossless(text);
  } catch {
    return null;
  }
  const list = Array.isArray(v) ? v : [v];
  if (list.length === 0 || !list.every((e) => isPlainObject(e) && "x" in e && "y" in e)) return null;
  return list;
}

export class EventClipboard {
  private text: string | null = null;

  constructor(private readonly system: SystemClipboard | null = systemClipboard()) {}

  get json(): string | null {
    return this.text;
  }

  get empty(): boolean {
    return this.text === null;
  }

  write(events: readonly unknown[]): string {
    this.text = stringifyJsonLossless(events, 2);
    try {
      this.system?.writeText(this.text).catch(() => undefined);
    } catch {
      // 시스템 클립보드를 못 써도 확장의 클립보드는 된다
    }
    return this.text;
  }

  read(): unknown[] | null {
    return parseEventsJson(this.text);
  }
}
