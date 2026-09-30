// 그래프 캔버스. 노드는 DOM, 선은 SVG 이고 둘 다 월드 좌표에 그린 뒤 한 번에 옮기고 확대한다 (screen = world * zoom + pan).
//   왼쪽 버튼: 노드를 누르면 고르고 끌기, 빈 곳은 상자 선택 (Shift 는 더하기). 가운데나 오른쪽 버튼, Space 와 왼쪽 버튼: 이동. 휠: 확대.
//   포트에서 포트로 끌면 잇는다 (입력에서 출력으로도). 이어진 입력을 끌면 그 선을 옮기고, 빈 곳에 놓으면 끊긴다.
//   빈 곳에 놓은 출력 선, 빈 곳의 오른쪽 클릭과 두 번 클릭은 노드 추가 목록을 연다. Alt 와 포트 클릭은 그 포트의 선을 모두 끊고,
//   선의 오른쪽 클릭은 그 선을 끊는다. 편집은 모두 문서의 명령이라 되돌리기 한 단계씩이다 (끌기는 한 단계로 합쳐진다).

import {
  assignable,
  connectData,
  connectExec,
  disconnectData,
  disconnectExec,
  exitsOf,
  layoutGraph,
  moveNodes,
  nodeGeometry,
  parseLink,
  switchCaseValues,
  type ExitName,
  type GraphDocument,
  type GraphNode,
  type GraphProblem,
  type GType,
  type NodeGeometry,
  type NodeSpec,
  type PinGeometry,
  type PinKind,
  type PortType,
} from "@initial-editor/core";
import { reaction } from "mobx";
import { observer } from "mobx-react-lite";
import { useCallback, useEffect, useMemo, useRef, useState, type PointerEvent as ReactPointerEvent } from "react";
import type { GraphSupport, GraphViewport } from "../../editor/graph/GraphSupport";
import { ArgEditor } from "./ArgEditor";

export interface PinRef {
  node: string;
  kind: PinKind;
  key: string;
}

/** 노드 추가 목록을 열 자리와, 빈 곳에 놓은 선 (새 노드와 이을 것) */
export interface PaletteRequest {
  screen: { x: number; y: number };
  world: { x: number; y: number };
  pending: PinRef | null;
}

interface Placed {
  node: GraphNode;
  spec: NodeSpec | null;
  geom: NodeGeometry;
  x: number;
  y: number;
  problems: GraphProblem[];
}

type Drag =
  | { kind: "pan"; sx: number; sy: number; origin: GraphViewport; moved: boolean; button: number }
  | { kind: "nodes"; sx: number; sy: number; origins: Map<string, [number, number]>; key: string; moved: boolean }
  | { kind: "band"; wx: number; wy: number; cx: number; cy: number; additive: boolean }
  | { kind: "wire"; from: PinRef; detach: PinRef | null; wx: number; wy: number; hover: PinRef | null };

const MIN_ZOOM = 0.1;
const MAX_ZOOM = 2;
const GRID = 24;
let dragSeq = 0;

const isOut = (k: PinKind) => k === "exec-out" || k === "data-out";
const isExecPin = (k: PinKind) => k === "exec-in" || k === "exec-out";

function curve(x1: number, y1: number, x2: number, y2: number): string {
  const dx = Math.max(40, Math.abs(x2 - x1) / 2);
  return `M ${x1} ${y1} C ${x1 + dx} ${y1}, ${x2 - dx} ${y2}, ${x2} ${y2}`;
}

function typeKey(t: GType | PortType | null | undefined): string {
  if (!t) return "any";
  if (t.t === "numeric") return "number";
  if (t.t === "key" || t.t === "button") return "enum";
  if (t.t === "comparable" || t.t === "switchable") return "any";
  return t.t;
}

export function fitViewport(nodes: readonly Placed[], width: number, height: number): GraphViewport {
  if (!nodes.length) return { x: 40, y: 40, zoom: 1 };
  const minX = Math.min(...nodes.map((p) => p.x));
  const minY = Math.min(...nodes.map((p) => p.y));
  const maxX = Math.max(...nodes.map((p) => p.x + p.geom.width));
  const maxY = Math.max(...nodes.map((p) => p.y + p.geom.height));
  const pad = 40;
  const zoom = Math.min(1, Math.max(MIN_ZOOM, Math.min((width - pad * 2) / Math.max(1, maxX - minX), (height - pad * 2) / Math.max(1, maxY - minY))));
  return { x: pad - minX * zoom, y: pad - minY * zoom, zoom };
}

export const GraphCanvas = observer(function GraphCanvas({
  doc,
  support,
  onPalette,
  fitSignal,
}: {
  doc: GraphDocument;
  support: GraphSupport;
  onPalette: (req: PaletteRequest) => void;
  /** 바뀌면 전체 보기 */
  fitSignal: number;
}) {
  const hostRef = useRef<HTMLDivElement>(null);
  const [view, setViewState] = useState<GraphViewport>(() => support.viewport(doc) ?? { x: 40, y: 40, zoom: 1 });
  const [drag, setDrag] = useState<Drag | null>(null);
  const spaceDown = useRef(false);
  const fitted = useRef(support.viewport(doc) !== null);

  const setView = useCallback(
    (v: GraphViewport) => {
      setViewState(v);
      support.setViewport(doc, v);
    },
    [doc, support],
  );

  const graph = doc.graph;
  const analysis = doc.analysis;

  // layout 이 없는 노드는 자동 정렬의 자리에 보인다 (파일은 끌어 옮길 때 바뀐다)
  const fallback = useMemo(() => (graph.nodes.some((n) => !graph.layout[n.id]) ? layoutGraph(graph, analysis) : {}), [graph, analysis]);

  const placed = useMemo<Placed[]>(() => {
    const byNode = new Map<string, GraphProblem[]>();
    for (const p of analysis.problems) if (p.node) byNode.set(p.node, [...(byNode.get(p.node) ?? []), p]);
    return graph.nodes.map((node) => {
      const spec = analysis.specs.get(node.id) ?? null;
      const geom = nodeGeometry(node, spec, node.kind === "flow.switch" ? switchCaseValues(analysis, node) : []);
      const [x, y] = graph.layout[node.id] ?? fallback[node.id] ?? [0, 0];
      return { node, spec, geom, x, y, problems: byNode.get(node.id) ?? [] };
    });
  }, [graph, analysis, fallback]);

  const byId = useMemo(() => new Map(placed.map((p) => [p.node.id, p])), [placed]);

  const pinAt = useCallback(
    (ref: PinRef): { x: number; y: number } | null => {
      const p = byId.get(ref.node);
      const pin = p?.geom.pins.find((q) => q.kind === ref.kind && q.key === ref.key);
      return p && pin ? { x: p.x + pin.x, y: p.y + pin.y } : null;
    },
    [byId],
  );

  // 처음 열면 전체 보기
  useEffect(() => {
    const host = hostRef.current;
    if (!host || fitted.current || !placed.length) return;
    fitted.current = true;
    setView(fitViewport(placed, host.clientWidth, host.clientHeight));
  }, [placed, setView]);

  useEffect(() => {
    const host = hostRef.current;
    if (!host || fitSignal === 0) return;
    setView(fitViewport(placed, host.clientWidth, host.clientHeight));
    // 전체 보기는 요청이 올 때만 한다 (노드가 바뀔 때마다가 아니다)
  }, [fitSignal]);

  // 오류 링크나 문제 목록이 노드를 보여 달라고 하면 그 노드를 가운데로
  useEffect(
    () =>
      reaction(
        () => support.focusRequest,
        (req) => {
          const host = hostRef.current;
          if (!req || req.doc !== doc || !host) return;
          const targets = req.nodes.map((id) => byId.get(id)).filter((p): p is Placed => !!p);
          if (!targets.length) return;
          const cx = targets.reduce((s, p) => s + p.x + p.geom.width / 2, 0) / targets.length;
          const cy = targets.reduce((s, p) => s + p.y + p.geom.height / 2, 0) / targets.length;
          const zoom = Math.max(view.zoom, 0.8);
          setView({ x: host.clientWidth / 2 - cx * zoom, y: host.clientHeight / 2 - cy * zoom, zoom });
        },
        { fireImmediately: true },
      ),
    [support, doc, byId, view.zoom, setView],
  );

  const toWorld = (clientX: number, clientY: number) => {
    const r = hostRef.current!.getBoundingClientRect();
    return { x: (clientX - r.left - view.x) / view.zoom, y: (clientY - r.top - view.y) / view.zoom, sx: clientX - r.left, sy: clientY - r.top };
  };

  // ---- 연결 규칙 ----

  const incoming = useMemo(() => {
    const exec = new Map<string, { node: string; exit: ExitName }>();
    const data = new Map<string, number>();
    for (const n of graph.nodes) {
      for (const [exit, target] of exitsOf(n)) exec.set(target, { node: n.id, exit });
      for (const link of Object.values(n.in ?? {})) {
        const ref = parseLink(link);
        const k = `${ref.node}.${ref.port}`;
        data.set(k, (data.get(k) ?? 0) + 1);
      }
    }
    return { exec, data };
  }, [graph]);

  /** 포트의 형식: 출력은 검사가 정한 값의 형식, 입력은 포트가 받는 형식 (상수가 정하는 자리의 형식이 아니다) */
  const pinType = (ref: PinRef): GType | PortType | null => {
    if (ref.kind === "data-out") return analysis.outType(ref.node, ref.key);
    if (ref.kind === "data-in") {
      const declared = byId.get(ref.node)?.geom.pins.find((p) => p.key === ref.key && p.kind === "data-in")?.port?.type ?? null;
      // 비교와 값 분기의 입력은 이어진 쪽의 형식을 따른다
      if (declared?.t === "comparable" || declared?.t === "switchable") return analysis.inputs.get(ref.node)?.[ref.key]?.type ?? declared;
      return declared;
    }
    return null;
  };

  /** 상수 편집기가 쓸 자리의 형식 */
  const argType = (ref: PinRef): GType | PortType | null => analysis.inputs.get(ref.node)?.[ref.key]?.type ?? pinType(ref);

  const canConnect = (a: PinRef, b: PinRef): boolean => {
    if (a.node === b.node || isOut(a.kind) === isOut(b.kind) || isExecPin(a.kind) !== isExecPin(b.kind)) return false;
    const out = isOut(a.kind) ? a : b;
    const inp = isOut(a.kind) ? b : a;
    if (isExecPin(out.kind)) return true;
    const from = pinType(out);
    const to = pinType(inp);
    if (!from || !to || from.t === "numeric" || from.t === "comparable" || from.t === "switchable") return true;
    return assignable(to as PortType, from as GType);
  };

  const connect = (a: PinRef, b: PinRef | null, detach: PinRef | null) => {
    const out = b && (isOut(a.kind) ? a : b);
    const inp = b && (isOut(a.kind) ? b : a);
    doc.change(b ? (isExecPin(a.kind) ? "실행 연결" : "값 연결") : "연결 해제", (g) => {
      if (detach) {
        if (detach.kind === "data-in") disconnectData(g, { node: detach.node, port: detach.key });
        else if (detach.kind === "exec-out") disconnectExec(g, { node: detach.node, exit: detach.key as ExitName });
      }
      if (!out || !inp) return;
      if (isExecPin(out.kind)) connectExec(g, { node: out.node, exit: out.key as ExitName }, inp.node);
      else connectData(g, { node: out.node, port: out.key }, { node: inp.node, port: inp.key });
    });
  };

  const disconnectPin = (ref: PinRef) => {
    doc.change("연결 해제", (g) => {
      if (ref.kind === "data-in") disconnectData(g, { node: ref.node, port: ref.key });
      else if (ref.kind === "exec-out") disconnectExec(g, { node: ref.node, exit: ref.key as ExitName });
      else if (ref.kind === "exec-in") {
        const src = incoming.exec.get(ref.node);
        if (src) disconnectExec(g, src);
      } else {
        for (const n of g.nodes)
          for (const [port, link] of Object.entries(n.in ?? {})) {
            const l = parseLink(link);
            if (l.node === ref.node && l.port === ref.key) disconnectData(g, { node: n.id, port });
          }
      }
    });
  };

  // ---- 포인터 ----

  const pinFromTarget = (target: EventTarget | null): PinRef | null => {
    const el = (target as HTMLElement | null)?.closest?.("[data-pin]") as HTMLElement | null;
    if (!el) return null;
    const node = el.closest("[data-node]")?.getAttribute("data-node");
    return node ? { node, kind: el.dataset.pinKind as PinKind, key: el.dataset.pin! } : null;
  };

  const onPointerDown = (e: ReactPointerEvent<HTMLDivElement>) => {
    const host = hostRef.current!;
    const target = e.target as HTMLElement;
    if (target.closest("input, select, textarea, button")) return;
    host.focus();
    const w = toWorld(e.clientX, e.clientY);
    if (e.button === 1 || e.button === 2 || (e.button === 0 && spaceDown.current)) {
      host.setPointerCapture(e.pointerId);
      setDrag({ kind: "pan", sx: e.clientX, sy: e.clientY, origin: view, moved: false, button: e.button });
      e.preventDefault();
      return;
    }
    if (e.button !== 0) return;
    const pin = pinFromTarget(target);
    if (pin) {
      e.preventDefault();
      if (e.altKey) {
        disconnectPin(pin);
        return;
      }
      host.setPointerCapture(e.pointerId);
      // 이어진 입력을 끌면 그 선을 옮긴다 (소스 쪽에서 다시 끈다)
      if (pin.kind === "data-in") {
        const link = graph.nodes.find((n) => n.id === pin.node)?.in?.[pin.key];
        if (link) {
          const src = parseLink(link);
          setDrag({ kind: "wire", from: { node: src.node, kind: "data-out", key: src.port }, detach: pin, wx: w.x, wy: w.y, hover: null });
          return;
        }
      }
      if (pin.kind === "exec-in") {
        const src = incoming.exec.get(pin.node);
        if (src) {
          const from: PinRef = { node: src.node, kind: "exec-out", key: src.exit };
          setDrag({ kind: "wire", from, detach: from, wx: w.x, wy: w.y, hover: null });
          return;
        }
      }
      setDrag({ kind: "wire", from: pin, detach: null, wx: w.x, wy: w.y, hover: null });
      return;
    }
    const nodeId = target.closest("[data-node]")?.getAttribute("data-node");
    if (nodeId) {
      const additive = e.shiftKey || e.ctrlKey || e.metaKey;
      if (additive) {
        if (doc.selection.has(nodeId)) doc.selection.delete(nodeId);
        else doc.select([nodeId], true);
      } else if (!doc.selection.has(nodeId)) doc.select([nodeId]);
      host.setPointerCapture(e.pointerId);
      const origins = new Map<string, [number, number]>();
      for (const id of doc.selection) {
        const p = byId.get(id);
        if (p) origins.set(id, [p.x, p.y]);
      }
      setDrag({ kind: "nodes", sx: e.clientX, sy: e.clientY, origins, key: `graph-drag:${++dragSeq}`, moved: false });
      return;
    }
    host.setPointerCapture(e.pointerId);
    if (!e.shiftKey) doc.clearSelection();
    setDrag({ kind: "band", wx: w.x, wy: w.y, cx: w.x, cy: w.y, additive: e.shiftKey });
  };

  const onPointerMove = (e: ReactPointerEvent<HTMLDivElement>) => {
    if (!drag) return;
    if (drag.kind === "pan") {
      const dx = e.clientX - drag.sx;
      const dy = e.clientY - drag.sy;
      if (!drag.moved && Math.abs(dx) + Math.abs(dy) < 3) return;
      setDrag({ ...drag, moved: true });
      setView({ ...drag.origin, x: drag.origin.x + dx, y: drag.origin.y + dy });
    } else if (drag.kind === "nodes") {
      const dx = (e.clientX - drag.sx) / view.zoom;
      const dy = (e.clientY - drag.sy) / view.zoom;
      if (!drag.moved && Math.abs(dx) + Math.abs(dy) < 3 / view.zoom) return;
      if (!drag.moved) setDrag({ ...drag, moved: true });
      const moves = [...drag.origins].map(([id, [x, y]]) => ({ id, x: x + dx, y: y + dy }));
      doc.change(moves.length === 1 ? `노드 이동: ${moves[0].id}` : `노드 ${moves.length}개 이동`, (g) => moveNodes(g, moves), drag.key, true);
    } else if (drag.kind === "band") {
      const w = toWorld(e.clientX, e.clientY);
      setDrag({ ...drag, cx: w.x, cy: w.y });
    } else {
      const w = toWorld(e.clientX, e.clientY);
      const over = pinFromTarget(document.elementFromPoint(e.clientX, e.clientY));
      setDrag({ ...drag, wx: w.x, wy: w.y, hover: over && canConnect(drag.from, over) ? over : null });
    }
  };

  const onPointerUp = (e: ReactPointerEvent<HTMLDivElement>) => {
    if (!drag) return;
    hostRef.current?.releasePointerCapture?.(e.pointerId);
    setDrag(null);
    if (drag.kind === "pan") {
      if (drag.button === 2 && !drag.moved) {
        const w = toWorld(e.clientX, e.clientY);
        onPalette({ screen: { x: w.sx, y: w.sy }, world: { x: w.x, y: w.y }, pending: null });
      }
    } else if (drag.kind === "band") {
      const x0 = Math.min(drag.wx, drag.cx);
      const x1 = Math.max(drag.wx, drag.cx);
      const y0 = Math.min(drag.wy, drag.cy);
      const y1 = Math.max(drag.wy, drag.cy);
      if (x1 - x0 < 2 && y1 - y0 < 2) return;
      const hits = placed.filter((p) => p.x < x1 && p.x + p.geom.width > x0 && p.y < y1 && p.y + p.geom.height > y0).map((p) => p.node.id);
      doc.select(hits, drag.additive);
    } else if (drag.kind === "wire") {
      if (drag.hover) connect(drag.from, drag.hover, drag.detach);
      else if (drag.detach) connect(drag.from, null, drag.detach);
      else {
        const w = toWorld(e.clientX, e.clientY);
        const over = pinFromTarget(document.elementFromPoint(e.clientX, e.clientY));
        if (!over) onPalette({ screen: { x: w.sx, y: w.sy }, world: { x: w.x, y: w.y }, pending: drag.from });
      }
    }
  };

  const onWheel = (e: React.WheelEvent<HTMLDivElement>) => {
    const w = toWorld(e.clientX, e.clientY);
    const zoom = Math.min(MAX_ZOOM, Math.max(MIN_ZOOM, view.zoom * Math.exp(-e.deltaY * 0.0015)));
    setView({ x: w.sx - w.x * zoom, y: w.sy - w.y * zoom, zoom });
  };

  const onKeyDown = (e: React.KeyboardEvent<HTMLDivElement>) => {
    if ((e.target as HTMLElement).closest("input, select, textarea")) return;
    if (e.key === " ") {
      spaceDown.current = true;
      e.preventDefault();
    } else if (e.key === "Escape") {
      doc.clearSelection();
    } else if ((e.key === "a" || e.key === "A") && (e.ctrlKey || e.metaKey)) {
      doc.select(graph.nodes.map((n) => n.id));
      e.preventDefault();
    } else if ((e.key === "f" || e.key === "F") && !e.ctrlKey && !e.metaKey && !e.altKey) {
      const host = hostRef.current!;
      const sel = placed.filter((p) => doc.selection.has(p.node.id));
      setView(fitViewport(sel.length ? sel : placed, host.clientWidth, host.clientHeight));
    }
  };

  const openPaletteAt = (e: React.MouseEvent<HTMLDivElement>) => {
    const target = e.target as HTMLElement;
    if (target.closest("[data-node], input, select, button")) return;
    const w = toWorld(e.clientX, e.clientY);
    onPalette({ screen: { x: w.sx, y: w.sy }, world: { x: w.x, y: w.y }, pending: null });
  };

  // ---- 선 ----

  const wires: { key: string; d: string; kind: "exec" | "data"; type: string; target: PinRef }[] = [];
  for (const p of placed) {
    for (const [exit, target] of exitsOf(p.node)) {
      const a = pinAt({ node: p.node.id, kind: "exec-out", key: exit });
      const b = pinAt({ node: target, kind: "exec-in", key: "in" });
      if (a && b) wires.push({ key: `x:${p.node.id}:${exit}`, d: curve(a.x, a.y, b.x, b.y), kind: "exec", type: "exec", target: { node: p.node.id, kind: "exec-out", key: exit } });
    }
    for (const [port, link] of Object.entries(p.node.in ?? {})) {
      const src = parseLink(link);
      const a = pinAt({ node: src.node, kind: "data-out", key: src.port });
      const b = pinAt({ node: p.node.id, kind: "data-in", key: port });
      if (a && b) wires.push({ key: `d:${p.node.id}:${port}`, d: curve(a.x, a.y, b.x, b.y), kind: "data", type: typeKey(analysis.outType(src.node, src.port)), target: { node: p.node.id, kind: "data-in", key: port } });
    }
  }
  let draft: { d: string; type: string; kind: "exec" | "data" } | null = null;
  if (drag?.kind === "wire") {
    const a = pinAt(drag.from);
    if (a) {
      const out = isOut(drag.from.kind);
      draft = {
        d: out ? curve(a.x, a.y, drag.wx, drag.wy) : curve(drag.wx, drag.wy, a.x, a.y),
        type: typeKey(pinType(drag.from)),
        kind: isExecPin(drag.from.kind) ? "exec" : "data",
      };
    }
  }

  const connected = (p: PinGeometry, id: string): boolean => {
    const n = byId.get(id)!.node;
    if (p.kind === "data-in") return !!n.in?.[p.key];
    if (p.kind === "exec-out") return exitsOf(n).some(([exit]) => exit === p.key);
    if (p.kind === "exec-in") return incoming.exec.has(id);
    return (incoming.data.get(`${id}.${p.key}`) ?? 0) > 0;
  };

  const band = drag?.kind === "band" ? drag : null;

  return (
    <div
      ref={hostRef}
      className="graph-canvas"
      tabIndex={0}
      data-testid="graph-canvas"
      data-zoom={view.zoom}
      data-pan-x={view.x}
      data-pan-y={view.y}
      data-panning={drag?.kind === "pan" && drag.moved ? "true" : "false"}
      style={{ backgroundSize: `${GRID * view.zoom}px ${GRID * view.zoom}px`, backgroundPosition: `${view.x}px ${view.y}px` }}
      onPointerDown={onPointerDown}
      onPointerMove={onPointerMove}
      onPointerUp={onPointerUp}
      onPointerCancel={() => setDrag(null)}
      onWheel={onWheel}
      onKeyDown={onKeyDown}
      onKeyUp={(e) => {
        if (e.key === " ") spaceDown.current = false;
      }}
      onContextMenu={(e) => e.preventDefault()}
      onDoubleClick={openPaletteAt}
    >
      <div className="graph-world" style={{ transform: `translate(${view.x}px, ${view.y}px) scale(${view.zoom})` }}>
        <svg className="graph-wires">
          {wires.map((w) => (
            <g key={w.key}>
              <path className="graph-wire" data-kind={w.kind} d={w.d} style={w.kind === "data" ? { stroke: `var(--graph-${w.type})` } : undefined} />
              <path
                className="graph-wire-hit"
                d={w.d}
                data-wire={w.key}
                onContextMenu={(e) => {
                  e.preventDefault();
                  e.stopPropagation();
                  disconnectPin(w.target);
                }}
              >
                <title>오른쪽 클릭: 연결 해제</title>
              </path>
            </g>
          ))}
          {draft && <path className="graph-wire graph-wire-draft" data-kind={draft.kind} d={draft.d} style={draft.kind === "data" ? { stroke: `var(--graph-${draft.type})` } : undefined} />}
        </svg>
        {placed.map((p) => (
          <GraphNodeView
            key={p.node.id}
            doc={doc}
            placed={p}
            selected={doc.selection.has(p.node.id)}
            connected={(pin) => connected(pin, p.node.id)}
            hover={drag?.kind === "wire" ? drag.hover : null}
            pinType={pinType}
            argType={argType}
          />
        ))}
      </div>
      {band && (
        <div
          className="graph-band"
          style={{
            left: Math.min(band.wx, band.cx) * view.zoom + view.x,
            top: Math.min(band.wy, band.cy) * view.zoom + view.y,
            width: Math.abs(band.cx - band.wx) * view.zoom,
            height: Math.abs(band.cy - band.wy) * view.zoom,
          }}
        />
      )}
    </div>
  );
});

const GraphNodeView = observer(function GraphNodeView({
  doc,
  placed,
  selected,
  connected,
  hover,
  pinType,
  argType,
}: {
  doc: GraphDocument;
  placed: Placed;
  selected: boolean;
  connected: (pin: PinGeometry) => boolean;
  hover: PinRef | null;
  pinType: (ref: PinRef) => GType | PortType | null;
  argType: (ref: PinRef) => GType | PortType | null;
}) {
  const { node, spec, geom, x, y, problems } = placed;
  const errors = problems.filter((p) => p.severity === "error");
  const warnings = problems.filter((p) => p.severity === "warning");
  const title = spec?.label ?? node.kind;
  const rightRows = new Set(geom.pins.filter((p) => p.kind === "exec-out" || p.kind === "data-out").map((p) => p.y));
  return (
    <div
      className="graph-node"
      data-node={node.id}
      data-kind={node.kind}
      data-selected={selected ? "true" : "false"}
      data-error={errors.length ? "true" : "false"}
      data-warning={warnings.length ? "true" : "false"}
      style={{ left: x, top: y, width: geom.width, height: geom.height }}
      title={problems.map((p) => p.message).join("\n") || undefined}
    >
      <div className="graph-node-header" data-cat={spec?.category ?? "flow"}>
        <span className="graph-node-title">{title}</span>
        {spec?.detail && <span className="graph-node-detail">{spec.detail}</span>}
      </div>
      {geom.pins.map((pin) => {
        const ref: PinRef = { node: node.id, kind: pin.kind, key: pin.key };
        const isHover = hover?.node === node.id && hover.kind === pin.kind && hover.key === pin.key;
        const data = pin.kind === "data-in" || pin.kind === "data-out";
        const on = connected(pin);
        const rowTop = pin.y - 13;
        return (
          <div key={`${pin.kind}:${pin.key}`}>
            {pin.y > 30 && pin.kind === "data-in" && (
              <div className="graph-row graph-row-in" style={{ top: rowTop }} data-wide={rightRows.has(pin.y) ? "false" : "true"}>
                <span className="graph-row-label">{pin.label}</span>
                {!on && pin.port && <ArgEditor doc={doc} node={node} port={pin.port} type={argType(ref)} />}
              </div>
            )}
            {pin.y > 30 && pin.kind !== "data-in" && pin.label && (
              <div className="graph-row graph-row-out" style={{ top: rowTop }}>
                <span className="graph-row-label">{pin.label}</span>
              </div>
            )}
            <span
              className="graph-pin"
              data-pin={pin.key}
              data-pin-kind={pin.kind}
              data-type={data ? typeKey(pinType(ref)) : undefined}
              data-connected={on ? "true" : "false"}
              data-hover={isHover ? "true" : "false"}
              style={{ left: pin.x, top: pin.y }}
              title={pin.label || undefined}
            />
          </div>
        );
      })}
    </div>
  );
});

