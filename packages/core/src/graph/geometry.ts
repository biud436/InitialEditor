// 캔버스의 노드 모양: 크기와 포트 위치 (노드 왼쪽 위 기준). 캔버스와 자동 정렬이 같이 쓴다.
//   제목 줄의 왼쪽이 실행 입력, 오른쪽이 next. 그 아래 줄마다 왼쪽은 값 입력, 오른쪽은 갈래 출구와 출력이다

import { exitsOf, type ExitName } from "./edit";
import type { GraphNode } from "./format";
import type { NodeSpec, PortDef } from "./kinds";

export const NODE_WIDTH = 210;
export const HEADER_HEIGHT = 30;
export const ROW_HEIGHT = 26;
const PADDING = 8;

export type PinKind = "exec-in" | "exec-out" | "data-in" | "data-out";

export interface PinGeometry {
  kind: PinKind;
  /** 값 포트의 key, 실행 출구의 이름 (next, then, else, body, case:<값>), 실행 입력은 "in" */
  key: string;
  label: string;
  x: number;
  y: number;
  /** 값 입력의 사양 (상수 편집기가 쓴다) */
  port?: PortDef;
}

export interface NodeGeometry {
  width: number;
  height: number;
  pins: PinGeometry[];
}

const EXIT_LABEL: Record<string, string> = { then: "참", else: "거짓", body: "본문" };

/** 노드의 모양. spec 이 없으면(종류나 설정이 틀린 노드) 파일에 있는 연결만으로 그린다. caseValues 는 값 분기가 보일 갈래 값 */
export function nodeGeometry(node: GraphNode, spec: NodeSpec | null, caseValues: readonly string[] = []): NodeGeometry {
  const pins: PinGeometry[] = [];
  const exec = spec ? spec.exec : exitsOf(node).length > 0;
  const mid = HEADER_HEIGHT / 2;
  if (exec && !spec?.event) pins.push({ kind: "exec-in", key: "in", label: "", x: 0, y: mid });
  if (exec) pins.push({ kind: "exec-out", key: "next", label: "", x: NODE_WIDTH, y: mid });

  const left: PinGeometry[] = [];
  const right: PinGeometry[] = [];
  if (spec) {
    for (const p of spec.inputs) left.push({ kind: "data-in", key: p.key, label: p.label, x: 0, y: 0, port: p });
    for (const e of spec.exits) {
      if (e === "cases") {
        const values = [...new Set([...caseValues, ...Object.keys(node.cases ?? {})])];
        for (const v of values) right.push({ kind: "exec-out", key: `case:${v}` satisfies ExitName, label: v, x: NODE_WIDTH, y: 0 });
      } else if (e === "else" && node.kind === "flow.switch") {
        right.push({ kind: "exec-out", key: "else", label: "기타", x: NODE_WIDTH, y: 0 });
      } else {
        right.push({ kind: "exec-out", key: e, label: EXIT_LABEL[e] ?? e, x: NODE_WIDTH, y: 0 });
      }
    }
    for (const o of spec.outputs) right.push({ kind: "data-out", key: o.key, label: spec.exec ? o.label : "", x: NODE_WIDTH, y: 0 });
  } else {
    const ports = new Set([...Object.keys(node.in ?? {}), ...Object.keys(node.args ?? {})]);
    for (const p of ports) left.push({ kind: "data-in", key: p, label: p, x: 0, y: 0 });
    for (const [exit] of exitsOf(node)) if (exit !== "next") right.push({ kind: "exec-out", key: exit, label: exit.replace(/^case:/, ""), x: NODE_WIDTH, y: 0 });
    if (!exec) right.push({ kind: "data-out", key: "out", label: "", x: NODE_WIDTH, y: 0 });
  }
  left.forEach((p, i) => (p.y = HEADER_HEIGHT + i * ROW_HEIGHT + ROW_HEIGHT / 2));
  right.forEach((p, i) => (p.y = HEADER_HEIGHT + i * ROW_HEIGHT + ROW_HEIGHT / 2));
  // 값 노드의 출력은 줄이 없으면 제목 줄에 둔다
  if (!exec && left.length === 0 && right.length === 1 && right[0].kind === "data-out") right[0].y = mid;
  pins.push(...left, ...right);
  const rows = !exec && left.length === 0 && right.length === 1 ? 0 : Math.max(left.length, right.length);
  return { width: NODE_WIDTH, height: HEADER_HEIGHT + rows * ROW_HEIGHT + (rows ? PADDING : 0), pins };
}
