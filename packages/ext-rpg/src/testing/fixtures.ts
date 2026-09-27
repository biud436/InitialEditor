// 테스트가 쓰는 픽스처 (packages/ext-rpg/test/fixtures, yarn sync:rpg 가 엔진에서 복사한다)와 엔진 저장소 위치.
// 모델 밖에 둔다 (Node 의 fs 를 쓴다).

import { existsSync, readdirSync, readFileSync } from "node:fs";
import path from "node:path";
import { parseMap, type MapData } from "@initial-editor/ext-tilemap/model";
import { parseEventSchema, type EventSchema } from "../model/schema";
import { parseGameConfig, parseItemTable, type GameConfig, type ItemTable } from "../model/game";

export const FIXTURES = path.resolve(__dirname, "..", "..", "test", "fixtures");
export const ENGINE = path.resolve(process.env.INITIAL2D_DIR ?? path.join(__dirname, "..", "..", "..", "..", "..", "Initial2D"));
/** 엔진 저장소가 M2 계약을 가졌는가 */
export const HAS_ENGINE = existsSync(path.join(ENGINE, "resources", "schema", "event-commands.json"));

export function fixturePath(rel: string): string {
  return path.join(FIXTURES, rel);
}

export function fixtureText(rel: string): string {
  return readFileSync(fixturePath(rel), "utf8");
}

export function fixtureSchema(): EventSchema {
  return parseEventSchema(fixtureText("resources/schema/event-commands.json"));
}

export function fixtureGame(): GameConfig {
  return parseGameConfig(fixtureText("resources/data/rpg-game.json"));
}

export function fixtureItems(): ItemTable {
  return parseItemTable(fixtureText("resources/data/items.json"));
}

export function fixtureMap(name: string): { text: string; map: MapData } {
  const text = fixtureText(`resources/maps/${name}.json`);
  return { text, map: parseMap(text) };
}

/** 엔진 저장소의 맵 파일 전부 (없으면 빈 배열) */
export function engineMapFiles(): string[] {
  const dir = path.join(ENGINE, "resources", "maps");
  if (!existsSync(dir)) return [];
  return readdirSync(dir)
    .filter((f) => f.endsWith(".json"))
    .sort()
    .map((f) => path.join(dir, f));
}
