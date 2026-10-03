// 그래프 탭의 옆 창: 고른 노드의 설정, 상태 필드와 지역 변수, 매개변수, 노드 라이브러리, 문제 목록.
// 이름과 값은 칸을 떠나거나 Enter 를 누를 때 반영한다 (변수 이름을 바꾸면 그 변수를 쓰는 노드도 바뀐다).

import {
  addVar,
  API_NODES,
  COMPONENT_FIELD_TYPES,
  OBJECT_FIELDS,
  removeVar,
  renameCase,
  setNodeSetting,
  setParams,
  setStateFrom,
  setUses,
  updateComment,
  updateVar,
  VAR_TYPES,
  WRITABLE_OBJECT_FIELDS,
  type GraphDocument,
  type GraphNode,
  type VarDecl,
  type VarList,
  type VarType,
} from "@initial-editor/core";
import { observer } from "mobx-react-lite";
import { useEffect, useState } from "react";
import type { GraphSupport } from "../../editor/graph/GraphSupport";
import { endNodeDrag, startNodeDrag, type NewNode } from "../../editor/graph/placeNode";

/** 떠날 때나 Enter 에 반영하는 글 칸 */
function CommitInput({ value, onCommit, placeholder, testId }: { value: string; onCommit: (v: string) => void; placeholder?: string; testId?: string }) {
  const [text, setText] = useState(value);
  useEffect(() => setText(value), [value]);
  const done = () => {
    if (text !== value) onCommit(text);
  };
  return (
    <input
      className="input"
      value={text}
      placeholder={placeholder}
      data-testid={testId}
      onChange={(e) => setText(e.target.value)}
      onBlur={done}
      onKeyDown={(e) => {
        if (e.key === "Enter") done();
        if (e.key === "Escape") setText(value);
      }}
    />
  );
}

function parseDefault(type: string, text: string): unknown {
  if (text.trim() === "") return undefined;
  if (type === "number" || type === "integer") {
    const n = Number(text);
    return Number.isFinite(n) ? n : text;
  }
  if (type === "boolean") return text === "true" ? true : text === "false" ? false : text;
  return text;
}

const NodeSettings = observer(function NodeSettings({ doc, node }: { doc: GraphDocument; node: GraphNode }) {
  const env = doc.analysis.env;
  const spec = doc.analysis.specs.get(node.id);
  const set = (key: "field" | "type" | "fn" | "const", value: string) => doc.change(`노드 설정: ${node.id}`, (g) => setNodeSetting(g, node.id, key, value));
  const select = (key: "field" | "type" | "fn" | "const", options: { value: string; label: string }[], label: string) => {
    const current = (node[key] as string | undefined) ?? "";
    return (
      <div className="graph-side-row">
        <label>{label}</label>
        <select className="select" value={current} data-testid={`graph-setting-${key}`} onChange={(e) => set(key, e.target.value)}>
          {!options.some((o) => o.value === current) && <option value={current}>{current || "선택"}</option>}
          {options.map((o) => (
            <option key={o.value} value={o.value}>
              {o.label}
            </option>
          ))}
        </select>
      </div>
    );
  };
  const vars = (list: Iterable<VarDecl>) => [...list].map((v) => ({ value: v.key, label: v.label ? `${v.key} (${v.label})` : v.key }));
  const k = node.kind;
  let settings = null;
  if (k === "state.get" || k === "state.set") settings = select("field", vars(env.state?.values() ?? []), "상태 필드");
  else if (k === "local.get" || k === "local.set") settings = select("field", vars(env.locals.values()), "변수");
  else if (k === "param.get") settings = select("field", [...env.params.values()].map((p) => ({ value: p.key, label: p.label ? `${p.key} (${p.label})` : p.key })), "매개변수");
  else if (k === "obj.get" || k === "obj.set") settings = select("field", (k === "obj.get" ? OBJECT_FIELDS : WRITABLE_OBJECT_FIELDS).map((f) => ({ value: f, label: f })), "속성");
  else if (k === "prop.get" || k === "prop.set")
    settings = (
      <>
        <div className="graph-side-row">
          <label>props 키</label>
          <CommitInput value={node.field ?? ""} onCommit={(v) => set("field", v)} testId="graph-setting-prop-key" />
        </div>
        {select("type", ["number", "integer", "boolean", "string"].map((t) => ({ value: t, label: t })), "값 형식")}
      </>
    );
  else if (k === "lib.const") settings = select("const", [...env.libraries.values()].flatMap((l) => l.constants.map((c) => ({ value: `${l.name}.${c.key}`, label: `${l.name}.${c.key}` }))), "상수");
  else if (k === "lib.call")
    settings = select("fn", [...env.libraries.values()].flatMap((l) => l.functions.filter((f) => f.returns !== "state").map((f) => ({ value: `${l.name}.${f.key}`, label: `${l.name}.${f.key}` }))), "함수");
  else if (k === "api.call") {
    const wantsValue = !!API_NODES.find((a) => a.id === node.fn)?.returns;
    settings = select("fn", API_NODES.filter((a) => !!a.returns === wantsValue).map((a) => ({ value: a.id, label: `${a.label} (${a.id})` })), "함수");
  } else if (k === "flow.switch") {
    const t = doc.analysis.inputs.get(node.id)?.value?.type;
    const cases = Object.keys(node.cases ?? {});
    settings = (
      <div>
        {t?.t === "enum" ? (
          <div className="muted">갈래: enum 값 전부 ({t.values.join(", ")})</div>
        ) : (
          <>
            {cases.map((c) => (
              <div className="graph-side-row" key={c}>
                <label>갈래</label>
                <CommitInput value={c} onCommit={(v) => doc.change("갈래 값 변경", (g) => renameCase(g, node.id, c, v.trim() || undefined))} />
              </div>
            ))}
            <div className="muted">갈래 포트에서 선을 드래그해 이어 줍니다. 새 갈래 값:</div>
            <CommitInput
              value=""
              placeholder="값을 입력하고 Enter"
              testId="graph-case-add"
              onCommit={(v) => {
                const value = v.trim();
                if (value && !cases.includes(value)) doc.change("갈래 추가", (g) => void (g.nodes.find((n) => n.id === node.id)!.cases = { ...(node.cases ?? {}), [value]: "" }));
              }}
            />
          </>
        )}
      </div>
    );
  }
  const own = doc.problems.filter((p) => p.node === node.id);
  return (
    <div className="graph-side-section" data-testid="graph-node-settings">
      <h3>
        <span>
          {spec?.label ?? node.kind} <span className="muted">{node.id}</span>
        </span>
      </h3>
      {settings}
      {own.map((p, i) => (
        <div key={i} className="graph-problem" data-severity={p.severity}>
          {p.message}
        </div>
      ))}
    </div>
  );
});

/** 줄 앞의 손잡이: 캔버스로 끌면 그 변수의 노드를 만든다 (GraphCanvas 의 drop) */
function DragGrip({ node, write }: { node: NewNode; write: boolean }) {
  return (
    <span
      className="graph-var-grip"
      draggable
      data-testid="graph-var-grip"
      data-field={node.field}
      title={write ? "캔버스로 드래그: 읽기 노드 (Alt: 쓰기 노드)" : "캔버스로 드래그: 읽기 노드"}
      onDragStart={(e) => startNodeDrag(e, node)}
      onDragEnd={endNodeDrag}
    >
      ⠿
    </span>
  );
}

function DragHint({ write }: { write: boolean }) {
  return (
    <div className="muted graph-drag-hint">
      ⠿를 캔버스로 드래그하면 노드가 추가됩니다. 입력 포트 위로 드래그하면 바로 연결됩니다.{write ? " Alt를 누른 채 드래그하면 값을 바꾸는 노드가 추가됩니다." : ""}
    </div>
  );
}

const VarSection = observer(function VarSection({ doc, which, title }: { doc: GraphDocument; which: VarList; title: string }) {
  const vars = which === "state" ? (doc.graph.state?.fields ?? []) : doc.graph.locals;
  const count = vars.length + (which === "state" ? doc.analysis.inheritedState.length : 0);
  const add = () => {
    const taken = new Set(vars.map((v) => v.key));
    let n = 1;
    while (taken.has(`value${n}`)) n++;
    doc.change(`${title} 추가`, (g) => addVar(g, which, { key: `value${n}`, type: "number" }));
  };
  const update = (v: VarDecl, next: Partial<VarDecl>) => doc.change(`${title} 변경: ${v.key}`, (g) => updateVar(g, which, v.key, cleanVar({ ...v, ...next })));
  const read = (key: string): NewNode => ({ kind: which === "state" ? "state.get" : "local.get", field: key });
  return (
    <details className="graph-side-section" open={count <= 4} data-testid={`graph-vars-${which}`}>
      <summary>
        <span>
          {title} <span className="muted">{count}</span>
        </span>
        <button className="btn btn-ghost" onClick={(e) => (e.preventDefault(), add())} data-testid={`graph-add-${which}`}>
          추가
        </button>
      </summary>
      {which === "state" && <StateFrom doc={doc} />}
      {which === "state" && doc.analysis.inheritedState.length > 0 && (
        <div className="graph-inherited" data-testid="graph-inherited-state">
          <div className="muted">라이브러리가 선언한 필드 (라이브러리 파일에서 편집합니다)</div>
          {doc.analysis.inheritedState.map((v) => (
            <div key={v.key} className="graph-inherited-row" title={v.label}>
              <DragGrip node={read(v.key)} write />
              <span className="graph-inherited-key">{v.key}</span>
              <span className="muted">{v.type === "enum" ? `enum (${(v.values ?? []).join(", ")})` : v.type}</span>
            </div>
          ))}
        </div>
      )}
      {count > 0 && <DragHint write />}
      {vars.length > 0 && (
        <div className="graph-var graph-var-head muted">
          <span />
          <span>이름</span>
          <span>형식</span>
          <span>기본값</span>
          <span />
        </div>
      )}
      {vars.map((v) => (
        <div className="graph-var" key={v.key} data-var={v.key} title={v.label}>
          <DragGrip node={read(v.key)} write />
          <CommitInput value={v.key} onCommit={(key) => update(v, { key: key.trim() })} />
          <select className="select" value={v.type} onChange={(e) => update(v, { type: e.target.value as VarType, values: e.target.value === "enum" ? (v.values ?? ["a", "b"]) : undefined, default: undefined })}>
            {VAR_TYPES.map((t) => (
              <option key={t} value={t}>
                {t}
              </option>
            ))}
          </select>
          {v.type === "object" ? <span /> : <CommitInput value={v.default === undefined ? "" : String(v.default)} onCommit={(s) => update(v, { default: parseDefault(v.type, s) })} />}
          <button className="btn btn-ghost" title="제거" onClick={() => doc.change(`${title} 제거: ${v.key}`, (g) => removeVar(g, which, v.key))}>
            ✕
          </button>
          {v.type === "enum" && (
            <div className="graph-var-extra">
              <CommitInput value={(v.values ?? []).join(", ")} placeholder="enum 값 (쉼표로 구분)" onCommit={(s) => update(v, { values: s.split(",").map((x) => x.trim()).filter(Boolean) })} />
            </div>
          )}
        </div>
      ))}
    </details>
  );
});

function cleanVar(v: VarDecl): VarDecl {
  const out: VarDecl = { key: v.key, type: v.type };
  if (v.label !== undefined) out.label = v.label;
  if (v.type === "enum" && v.values) out.values = v.values;
  if (v.default !== undefined) out.default = v.default;
  if (v.ruby !== undefined) out.ruby = v.ruby;
  if (v.extra) out.extra = v.extra;
  return out;
}

const StateFrom = observer(function StateFrom({ doc }: { doc: GraphDocument }) {
  const from = doc.graph.state?.from ?? "scene";
  const options = [{ value: "scene", label: "scene.state" }, ...[...doc.analysis.env.libraries.values()].flatMap((l) => l.functions.filter((f) => f.returns === "state").map((f) => ({ value: `${l.name}.${f.key}`, label: `${l.name}.${f.key}(scene)` })))];
  return (
    <div className="graph-side-row">
      <label>상태 표</label>
      <select className="select" value={from} onChange={(e) => doc.change("상태 표 변경", (g) => setStateFrom(g, e.target.value))}>
        {!options.some((o) => o.value === from) && <option value={from}>{from}</option>}
        {options.map((o) => (
          <option key={o.value} value={o.value}>
            {o.label}
          </option>
        ))}
      </select>
    </div>
  );
});

const ParamsSection = observer(function ParamsSection({ doc }: { doc: GraphDocument }) {
  const params = doc.graph.params ?? [];
  const change = (label: string, next: Record<string, unknown>[] | null) => doc.change(label, (g) => setParams(g, next));
  const add = () => {
    const taken = new Set(params.map((p) => p.key));
    let n = 1;
    while (taken.has(`param${n}`)) n++;
    change("매개변수 추가", [...params, { key: `param${n}`, type: "number", default: 0 }]);
  };
  const update = (i: number, patch: Record<string, unknown>) => {
    const next = params.map((p, j) => (j === i ? { ...p, ...patch } : p));
    for (const p of next) for (const k of Object.keys(p)) if (p[k] === undefined) delete p[k];
    change("매개변수 변경", next);
  };
  return (
    <details className="graph-side-section" open data-testid="graph-params">
      <summary>
        <span>
          매개변수 <span className="muted">{params.length}</span>
        </span>
        <button className="btn btn-ghost" onClick={(e) => (e.preventDefault(), add())} data-testid="graph-add-param">
          추가
        </button>
      </summary>
      {params.length === 0 && <div className="muted">씬의 인스펙터에서 오브젝트마다 값을 정하는 입력 항목입니다. 추가하면 선언 파일도 만듭니다.</div>}
      {params.length > 0 && <DragHint write={false} />}
      {params.map((p, i) => (
        <div className="graph-var" key={i} data-param={String(p.key ?? "")}>
          <DragGrip node={{ kind: "param.get", field: String(p.key ?? "") }} write={false} />
          <CommitInput value={String(p.key ?? "")} onCommit={(key) => update(i, { key: key.trim() })} />
          <select className="select" value={String(p.type ?? "number")} onChange={(e) => update(i, { type: e.target.value, default: undefined, values: e.target.value === "enum" ? ["a", "b"] : undefined })}>
            {COMPONENT_FIELD_TYPES.map((t) => (
              <option key={t} value={t}>
                {t}
              </option>
            ))}
          </select>
          {p.type === "object" ? <span /> : <CommitInput value={p.default === undefined ? "" : String(p.default)} onCommit={(s) => update(i, { default: parseDefault(String(p.type), s) })} />}
          <button className="btn btn-ghost" title="제거" onClick={() => change("매개변수 제거", params.length === 1 ? null : params.filter((_, j) => j !== i))}>
            ✕
          </button>
          {p.type === "enum" && (
            <div className="graph-var-extra">
              <CommitInput value={Array.isArray(p.values) ? p.values.join(", ") : ""} placeholder="enum 값 (쉼표로 구분)" onCommit={(s) => update(i, { values: s.split(",").map((x) => x.trim()).filter(Boolean) })} />
            </div>
          )}
        </div>
      ))}
    </details>
  );
});

const LibrarySection = observer(function LibrarySection({ doc }: { doc: GraphDocument }) {
  const uses = doc.graph.uses;
  return (
    <details className="graph-side-section" open={uses.length > 0} data-testid="graph-libraries">
      <summary>
        <span>
          노드 라이브러리 <span className="muted">{uses.length}</span>
        </span>
      </summary>
      {uses.map((u) => {
        const lib = doc.libraries.get(u);
        return (
          <div className="graph-side-row" key={u}>
            <span className="muted" title={typeof lib === "string" ? lib : undefined}>
              {typeof lib === "object" ? `${lib.label} (${lib.name})` : `읽지 못함: ${u}`}
            </span>
            <button className="btn btn-ghost" title="제거" onClick={() => doc.change("라이브러리 제거", (g) => setUses(g, uses.filter((x) => x !== u)))}>
              ✕
            </button>
          </div>
        );
      })}
      <CommitInput
        value=""
        placeholder="scripts/.../이름.nodes.json 을 입력하고 Enter"
        testId="graph-add-library"
        onCommit={(path) => {
          const p = path.trim();
          if (p && !uses.includes(p)) doc.change("라이브러리 추가", (g) => setUses(g, [...uses, p]));
        }}
      />
    </details>
  );
});

const CommentSettings = observer(function CommentSettings({ doc, id }: { doc: GraphDocument; id: string }) {
  const comment = doc.graph.comments?.find((c) => c.id === id);
  const [text, setText] = useState(comment?.text ?? "");
  useEffect(() => setText(comment?.text ?? ""), [comment?.text]);
  if (!comment) return null;
  const done = () => {
    if (text !== comment.text) doc.change(`메모 변경: ${id}`, (g) => updateComment(g, id, { text }), undefined, true);
  };
  return (
    <div className="graph-side-section" data-testid="graph-comment-settings">
      <h3>
        <span>
          메모 <span className="muted">{id}</span>
        </span>
      </h3>
      <textarea className="input graph-comment-text" rows={4} value={text} data-testid="graph-comment-text" onChange={(e) => setText(e.target.value)} onBlur={done} />
      <div className="muted">첫 줄이 상자의 제목입니다. 머리를 드래그하면 안의 노드가 함께 움직입니다.</div>
    </div>
  );
});

export const GraphSidePanel = observer(function GraphSidePanel({ doc, support }: { doc: GraphDocument; support: GraphSupport }) {
  const selected = doc.graph.nodes.filter((n) => doc.selection.has(n.id));
  const notes = (doc.graph.comments ?? []).filter((c) => doc.selection.has(c.id));
  const problems = doc.problems;
  return (
    <div className="graph-side" data-testid="graph-side">
      {selected.length === 1 && <NodeSettings doc={doc} node={selected[0]} />}
      {selected.length === 0 && notes.length === 1 && <CommentSettings doc={doc} id={notes[0].id} />}
      {selected.length > 1 && <div className="graph-side-section muted">노드 {selected.length}개 선택됨</div>}
      <VarSection doc={doc} which="state" title="상태 필드" />
      <VarSection doc={doc} which="locals" title="지역 변수" />
      <ParamsSection doc={doc} />
      <LibrarySection doc={doc} />
      <div className="graph-side-section" data-testid="graph-problem-list">
        <h3>
          <span>문제 {problems.length}</span>
        </h3>
        {problems.length === 0 && <div className="muted">문제 없음</div>}
        {problems.map((p, i) => (
          <button key={i} type="button" className="graph-problem" data-severity={p.severity} onClick={() => p.node && support.focus(doc, [p.node])}>
            {p.node ? `${p.node}: ` : ""}
            {p.message}
          </button>
        ))}
      </div>
    </div>
  );
});
