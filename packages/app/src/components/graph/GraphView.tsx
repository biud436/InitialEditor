// 그래프 문서 뷰 (docs/plans/visual-scripting.md 7절). 머리줄(컴포넌트 이름, 노드 수, 문제, 생성 상태, 커맨드), 캔버스, 옆 창.
// 노드 추가 목록에서 고른 노드는 연 자리에 놓고, 빈 곳에 놓은 선이 있었으면 새 노드의 맞는 포트와 잇는다.

import { addNode, assignable, connectData, connectExec, generatedPaths, nodeGeometry, nodeSpec, type ExitName, type GraphDocument, type GType, type PortType } from "@initial-editor/core";
import { observer } from "mobx-react-lite";
import { useMemo, useState } from "react";
import { useEditor } from "../../editor/EditorContext";
import { paletteEntries, type PaletteEntry } from "../../editor/graph/palette";
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

  const openCenter = () => {
    const host = document.querySelector<HTMLElement>(`[data-graph-path="${CSS.escape(doc.path ?? "")}"] .graph-canvas`);
    const w = host?.clientWidth ?? 600;
    const h = host?.clientHeight ?? 400;
    const v = support.viewport(doc) ?? { x: 0, y: 0, zoom: 1 };
    setPalette({ screen: { x: w / 2 - 140, y: 40 }, world: { x: (w / 2 - v.x) / v.zoom, y: (h / 2 - v.y) / v.zoom }, pending: null });
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
        {palette && <GraphPalette entries={entries} at={palette.screen} onPick={pick} onClose={() => setPalette(null)} />}
      </div>
    </div>
  );
});
