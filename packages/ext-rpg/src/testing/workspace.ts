// 테스트의 작업 공간: 메모리 백엔드에 픽스처 파일을 두고 프로젝트 열기, 닫기, 파일 변경을 흉내 낸다 (앱의 Editor.workspace 와 같은 모양).

import { readFileSync } from "node:fs";
import { DocumentRegistry, Emitter, MemoryBackend, type Workspace } from "@initial-editor/core";
import { fixturePath } from "./fixtures";

/** RPG 프로젝트의 픽스처 파일 (프로젝트 경로 → 내용) */
export function rpgProjectFiles(): Record<string, string | Uint8Array> {
  const text = (rel: string) => readFileSync(fixturePath(rel), "utf8");
  const bin = (rel: string) => new Uint8Array(readFileSync(fixturePath(rel)));
  return {
    "resources/schema/event-commands.json": text("resources/schema/event-commands.json"),
    "resources/data/rpg-game.json": text("resources/data/rpg-game.json"),
    "resources/data/items.json": text("resources/data/items.json"),
    "resources/maps/port_town.json": text("resources/maps/port_town.json"),
    "resources/maps/inn.json": text("resources/maps/inn.json"),
    "resources/charsets/placeholder.png": bin("resources/charsets/placeholder.png"),
    "resources/faces/placeholder.png": bin("resources/faces/placeholder.png"),
    "resources/tiles/port16.png": bin("resources/tiles/port16.png"),
    "scripts/lua/maps/port_town.lua": 'return { map = "./resources/maps/port_town.json", start = { x = 16, y = 44, dir = "up" } }\n',
  };
}

export interface MemoryWorkspace {
  ws: Workspace;
  backend: MemoryBackend;
  documents: DocumentRegistry;
  logs: Array<[string, string]>;
  toasts: string[];
  open(): Promise<void>;
  close(): void;
}

export function memoryWorkspace(files: Record<string, string | Uint8Array> = rpgProjectFiles()): MemoryWorkspace {
  const backend = new MemoryBackend(files);
  const events = new Emitter<{ opened: void; closed: void }>();
  const documents = new DocumentRegistry();
  const logs: Array<[string, string]> = [];
  const toasts: string[] = [];
  let isOpen = false;
  const log = (level: string) => (_source: string, text: string) => void logs.push([level, text]);
  const toast = (text: string) => void toasts.push(text);
  const ws: Workspace = {
    backend: () => backend,
    project: {
      get isOpen() {
        return isOpen;
      },
      get root() {
        return isOpen ? "/project" : "";
      },
      onOpened: (l) => events.on("opened", () => l()),
      onClosed: (l) => events.on("closed", () => l()),
      onFileChange: (l) => backend.watch(l),
    },
    documents,
    log: { info: log("info"), warn: log("warn"), error: log("error") },
    toasts: { info: toast, success: toast, warn: toast, error: toast },
    openPath: async () => {},
  };
  return {
    ws,
    backend,
    documents,
    logs,
    toasts,
    async open() {
      await backend.open("/project");
      isOpen = true;
      events.emit("opened", undefined);
    },
    close() {
      isOpen = false;
      events.emit("closed", undefined);
    },
  };
}
