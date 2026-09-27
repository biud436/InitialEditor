// 커맨드 클립보드. 확장 안에 따로 둔다 (씬의 tools.clipboard 나 이벤트 클립보드와 섞이지 않는다, e5 문서 2.4).
// 담는 것은 커맨드 배열의 JSON 글이고, 시스템 클립보드에도 같은 글을 적어 둔다 (텍스트 편집기에 붙일 수 있다).

import { isPlainObject } from "../model/json";

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

/** 커맨드 JSON 글을 읽는다: 커맨드 객체의 배열이나 커맨드 객체 하나. 아니면 null */
export function parseCommandsJson(text: string | null): unknown[] | null {
  if (text === null) return null;
  let v: unknown;
  try {
    v = JSON.parse(text);
  } catch {
    return null;
  }
  const list = Array.isArray(v) ? v : [v];
  if (list.length === 0 || !list.every((c) => isPlainObject(c) && typeof c.code === "string")) return null;
  return list;
}

export class CommandClipboard {
  private text: string | null = null;

  constructor(private readonly system: SystemClipboard | null = systemClipboard()) {}

  /** 담은 JSON 글 */
  get json(): string | null {
    return this.text;
  }

  write(commands: readonly unknown[]): string {
    this.text = JSON.stringify(commands, null, 2);
    try {
      this.system?.writeText(this.text).catch(() => undefined);
    } catch {
      // 시스템 클립보드를 못 써도 확장의 클립보드는 된다
    }
    return this.text;
  }

  read(): unknown[] | null {
    return parseCommandsJson(this.text);
  }
}

/** 확장 하나에 하나 */
export const commandClipboard = new CommandClipboard();
