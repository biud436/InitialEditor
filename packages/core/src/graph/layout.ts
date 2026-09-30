// 자동 정렬. 격자의 열마다 지금까지 채운 아래 끝(스카이라인)을 기억하며 놓는다.
//   이벤트마다 실행 줄기를 한 줄에 한 열씩 오른쪽으로 놓고, 문장에 드는 값 노드는 그 문장의 왼쪽 열들(먼 입력일수록 왼쪽)에
//   문장 줄 아래로 쌓는다. 갈래는 부모 문장 아래에 한 열 들여 놓고(그 열들에서 비어 있는 높이), 갈래가 있는 문장의 다음 문장은
//   갈래들이 끝난 열에서 잇는다 (갈래는 그 아래 줄이라 겹치지 않는다).

import type { GraphFile, GraphNode } from "./format";
import { nodeGeometry, NODE_WIDTH } from "./geometry";
import { HOOKS } from "./kinds";
import type { GraphAnalysis } from "./validate";
import { parseLink } from "./validate";

const COLUMN = NODE_WIDTH + 50;
const DATA_TOP = 56;
const GAP_Y = 18;
const BAND_GAP = 60;
/** 갈래 줄을 부모 줄에서 적어도 이만큼 내린다 (다음 문장이 키가 커도 겹치지 않게) */
const ROW_MIN = 150;

/** 값 분기가 보여 줄 갈래 값: 값이 enum 이면 그 값 전부, 아니면 파일에 있는 갈래 */
export function switchCaseValues(a: GraphAnalysis | null, n: GraphNode): string[] {
  const t = a?.inputs.get(n.id)?.value?.type;
  return t?.t === "enum" ? [...t.values] : Object.keys(n.cases ?? {});
}

export function nodeSize(a: GraphAnalysis | null, n: GraphNode): { width: number; height: number } {
  const g = nodeGeometry(n, a?.specs.get(n.id) ?? null, n.kind === "flow.switch" ? switchCaseValues(a, n) : []);
  return { width: g.width, height: g.height };
}

/** 모든 노드의 새 좌표 */
export function layoutGraph(g: GraphFile, a: GraphAnalysis | null): Record<string, [number, number]> {
  const byId = new Map(g.nodes.map((n) => [n.id, n]));
  const isExec = (id: string) => a?.specs.get(id)?.exec ?? false;
  const height = (id: string) => nodeSize(a, byId.get(id)!).height;
  const col = new Map<string, number>();
  const top = new Map<string, number>();
  const skyline = new Map<number, number>();
  const sky = (c: number) => skyline.get(c) ?? -Infinity;
  const put = (id: string, c: number, y: number) => {
    col.set(id, c);
    top.set(id, y);
    skyline.set(c, Math.max(sky(c), y + height(id) + GAP_Y));
  };
  const bottom = () => Math.max(0, ...skyline.values());

  /** 문장이 쓰는 아직 놓지 않은 값 노드를 가까운 입력부터 단계별로 */
  const dataLevels = (id: string): string[][] => {
    const levels: string[][] = [];
    let frontier = [id];
    const seen = new Set<string>();
    while (frontier.length) {
      const next: string[] = [];
      for (const f of frontier) {
        for (const link of Object.values(byId.get(f)?.in ?? {})) {
          const src = parseLink(link).node;
          if (!byId.has(src) || isExec(src) || col.has(src) || seen.has(src)) continue;
          seen.add(src);
          next.push(src);
        }
      }
      if (next.length) levels.push(next);
      frontier = next;
    }
    return levels;
  };

  const chainLength = (head: string): number => {
    let n = 0;
    const seen = new Set<string>();
    for (let id: string | undefined = head; id && byId.has(id) && !seen.has(id); id = byId.get(id)!.next) {
      seen.add(id);
      n++;
    }
    return n;
  };

  /** 줄기 하나를 c0 열, y 줄에서 놓는다. 쓴 마지막 열 */
  const chain = (head: string | undefined, c0: number, y: number): number => {
    let c = c0;
    let last = c0 - 1;
    const seen = new Set<string>();
    for (let id = head; id && byId.has(id) && !seen.has(id) && !col.has(id); id = byId.get(id)!.next) {
      seen.add(id);
      put(id, c, y);
      dataLevels(id).forEach((level, i) => {
        const dc = c - 1 - i;
        for (const d of level) put(d, dc, Math.max(y + DATA_TOP, sky(dc)));
      });
      const n = byId.get(id)!;
      const heads = [n.then, n.else, n.body, ...Object.values(n.cases ?? {})].filter((h): h is string => !!h);
      let end = c;
      let subY = y + Math.max(height(id), ROW_MIN) + GAP_Y;
      for (const h of heads) {
        const cols = Array.from({ length: chainLength(h) }, (_, k) => c + 1 + k);
        const y0 = Math.max(subY, ...cols.map((k) => sky(k)));
        end = Math.max(end, chain(h, c + 1, y0));
        subY = Math.max(subY, ...Array.from({ length: end - c }, (_, k) => sky(c + 1 + k)));
      }
      last = Math.max(last, end);
      c = heads.length ? Math.max(c + 1, end) : c + 1;
    }
    return last;
  };

  for (const hook of HOOKS) {
    const ev = a?.events.get(hook) ?? g.nodes.find((n) => n.kind === `event.${hook}`)?.id;
    if (!ev || col.has(ev)) continue;
    const y = skyline.size ? bottom() + BAND_GAP : 0;
    put(ev, 0, y);
    chain(byId.get(ev)!.next, 1, y);
  }
  // 이어지지 않은 실행 노드는 그 줄기째, 쓰이지 않는 값 노드는 맨 아래 한 줄에
  for (const n of g.nodes) if (!col.has(n.id) && isExec(n.id)) chain(n.id, 0, bottom() + BAND_GAP);
  const restY = bottom() + BAND_GAP;
  let rc = 0;
  for (const n of g.nodes) if (!col.has(n.id)) put(n.id, rc++, restY);

  const minCol = Math.min(0, ...col.values());
  const out: Record<string, [number, number]> = {};
  for (const n of g.nodes) out[n.id] = [(col.get(n.id)! - minCol) * COLUMN, top.get(n.id)!];
  return out;
}
