// 그래프 문서 뷰 (docs/plans/visual-scripting.md 7절). 머리줄(컴포넌트 이름, 노드 수, 문제, 생성 상태, 커맨드), 캔버스, 옆 창.
// 노드 추가 목록에서 고른 노드는 연 자리에 놓고, 빈 곳에 놓은 선이 있었으면 새 노드의 맞는 포트와 잇는다.

import { addNode, assignable, connectData, connectExec, generatedPaths, nodeGeometry, nodeSpec, type ExitName, type GraphDocument, type GType, type PortType } from "@initial-editor/core";
import { observer } from "mobx-react-lite";
import { useMemo, useState } from "react";
import { useEditor } from "../../editor/EditorContext";
import { fitsWire, paletteEntries, type PaletteEntry, type WireEnd } from "../../editor/graph/palette";
import { GraphCanvas, type PaletteRequest } from "./GraphCanvas";
import { GraphPalette } from "./GraphPalette";
import { GraphSidePanel } from "./GraphSidePanel";
import "./GraphView.css";

const GENERATION_LABEL: Record<string, string> = {
  written: "생성 코드 저장됨",
  unchanged: "생성 코드 최신",
  errors: "오류로 생성 안 됨",
  blocked: "손으로 쓴 파일이 있어 일부 생성 안 됨",
};

export const GraphView = observer(function GraphView({ doc }: { doc: GraphDocument }) {
  const editor = useEditor();
  const support = editor.graphSupport;
  const [palette, setPalette] = useState<PaletteRequest | null>(null);
  const [fitSignal, setFitSignal] = useState(0);
  const entries = useMemo(() => paletteEntries(doc.graph, doc.analysis), [doc.graph, doc.analysis]);
  // 선을 빈 곳에 놓아 열었으면 그 선을 이을 수 있는 노드만
  const wireEnd = useMemo((): WireEnd | null => {
    const from = palette?.pending;
    if (!from) return null;
    if (from.kind === "exec-out" || from.kind === "exec-in") return { kind: from.kind };
    if (from.kind === "data-out") return { kind: "data-out", type: doc.analysis.outType(from.node, from.key) };
    const target = doc.graph.nodes.find((n) => n.id === from.node);
    const spec = target ? nodeSpec(target, doc.analysis.env) : null;
    return { kind: "data-in", type: spec && typeof spec !== "string" ? (spec.inputs.find((p) => p.key === from.key)?.type ?? null) : null };
  }, [palette, doc.graph, doc.analysis]);
  const shown = useMemo(() => (wireEnd ? entries.filter((e) => fitsWire(e, wireEnd, doc.analysis.env)) : entries), [entries, wireEnd, doc.analysis]);
  const errors = doc.problems.filter((p) => p.severity === "error").length;
  const warnings = doc.problems.length - errors;
  const gen = doc.lastGeneration;
  const paths = generatedPaths(doc.logicalName);

  const pick = (entry: PaletteEntry) => {
    const req = palette!;
    setPalette(null);
    let added = "";
    doc.change(`노드 추가: ${entry.label}`, (g) => {
      added = addNode(g, entry.node, [req.world.x, req.world.y]);
      const from = req.pending;
      if (!from) return;
      const node = g.nodes.find((n) => n.id === added)!;
      const spec = nodeSpec(node, doc.analysis.env);
      if (typeof spec === "string") return;
      const pins = nodeGeometry(node, spec).pins;
      if (from.kind === "exec-out" && spec.exec && !spec.event) connectExec(g, { node: from.node, exit: from.key as ExitName }, added);
      else if (from.kind === "exec-in" && spec.exec) connectExec(g, { node: added, exit: "next" }, from.node);
      else if (from.kind === "data-out") {
        const t = doc.analysis.outType(from.node, from.key);
        const port = spec.inputs.find((p) => !t || assignable(p.type, t));
        if (port) connectData(g, { node: from.node, port: from.key }, { node: added, port: port.key });
      } else if (from.kind === "data-in" && pins.some((p) => p.kind === "data-out")) {
        const target = g.nodes.find((n) => n.id === from.node);
        const targetSpec = target ? nodeSpec(target, doc.analysis.env) : null;
        const want: GType | PortType | undefined = targetSpec && typeof targetSpec !== "string" ? targetSpec.inputs.find((p) => p.key === from.key)?.type : undefined;
        const out = spec.outputs[0];
        if (out && (!want || assignable(want as PortType, out.type))) connectData(g, { node: added, port: out.key }, { node: from.node, port: from.key });
      }
    });
    if (added) doc.select([added]);
  };

  /** 캔버스 가운데의 월드 좌표와 캔버스 크기 */
  const viewCenter = () => {
    const host = document.querySelector<HTMLElement>(`[data-graph-path="${CSS.escape(doc.path ?? "")}"] .graph-canvas`);
    const w = host?.clientWidth ?? 600;
    const h = host?.clientHeight ?? 400;
    const v = support.viewport(doc) ?? { x: 0, y: 0, zoom: 1 };
    return { w, h, world: { x: (w / 2 - v.x) / v.zoom, y: (h / 2 - v.y) / v.zoom } };
  };

  const openCenter = () => {
    const c = viewCenter();
    setPalette({ screen: { x: c.w / 2 - 140, y: 40 }, world: c.world, pending: null });
  };

  return (
    <div className="graph-view" data-testid="graph-view" data-graph-path={doc.path ?? ""} data-errors={errors} data-generation={gen?.status ?? ""}>
      <div className="doc-header graph-view-header">
        <span className="doc-header-path" title={doc.path ?? undefined}>
          {doc.logicalName}
        </span>
        <span>노드 {doc.graph.nodes.length}</span>
        <span className={errors ? "graph-view-status-error" : undefined} data-testid="graph-status">
          {errors ? `오류 ${errors}` : "오류 없음"}
          {warnings ? `, 경고 ${warnings}` : ""}
        </span>
        {gen && <span data-testid="graph-generation">{GENERATION_LABEL[gen.status]}</span>}
        <span className="doc-header-spacer" />
        <button className="btn btn-ghost" onClick={openCenter} data-testid="graph-add-node">
          노드 추가
        </button>
        <button className="btn btn-ghost" onClick={() => support.addComment(doc, viewCenter().world)} data-testid="graph-add-comment" title="선택한 노드를 감싸는 메모 상자">
          메모
        </button>
        <button className="btn btn-ghost" onClick={() => support.layout(doc)} data-testid="graph-layout">
          자동 정렬
        </button>
        <button className="btn btn-ghost" onClick={() => setFitSignal((n) => n + 1)} title="F">
          전체 보기
        </button>
        <button className="btn btn-ghost" onClick={() => void editor.openPath(paths.lua)} title={paths.lua}>
          Lua 코드
        </button>
        <button className="btn btn-ghost" onClick={() => void editor.openPath(paths.ruby)} title={paths.ruby}>
          Ruby 코드
        </button>
        {gen?.status === "blocked" && (
          <button className="btn" onClick={() => void support.overwriteGenerated(doc)} data-testid="graph-overwrite">
            생성 파일 덮어쓰기
          </button>
        )}
      </div>
      <div className="graph-view-body" style={{ position: "relative" }}>
        <GraphCanvas doc={doc} support={support} onPalette={setPalette} fitSignal={fitSignal} />
        <GraphSidePanel doc={doc} support={support} />
        {palette && <GraphPalette entries={shown} title={wireEnd ? "선에 이을 수 있는 노드" : undefined} at={palette.screen} onPick={pick} onClose={() => setPalette(null)} />}
      </div>
    </div>
  );
});
