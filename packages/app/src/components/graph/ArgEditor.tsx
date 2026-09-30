// 노드의 이어지지 않은 값 입력에 넣는 상수. 포트의 형식(검사가 정한 자리의 형식)으로 입력 칸을 고른다.
// 타이핑은 한 입력 칸에서 이어지는 동안 되돌리기 한 단계로 합쳐진다.

import { KEY_CODES, setArg, type GraphDocument, type GraphNode, type GType, type PortDef, type PortType } from "@initial-editor/core";
import { useEffect, useState } from "react";

const stop = (e: { stopPropagation(): void }) => e.stopPropagation();

export function ArgEditor({ doc, node, port, type }: { doc: GraphDocument; node: GraphNode; port: PortDef; type: GType | PortType | null }) {
  const t = type ?? port.type;
  const value = node.args?.[port.key];
  const key = `graph-arg:${node.id}:${port.key}`;
  const commit = (v: unknown) => doc.change(`상수 변경: ${node.id}.${port.key}`, (g) => setArg(g, node.id, port.key, v), key);
  // 키는 막지 않는다: 전역 단축키가 입력 칸에서는 저장과 되돌리기만 받는다 (shortcuts.ts)
  const common = { className: "graph-arg", "data-arg": port.key, onPointerDown: stop, onDoubleClick: stop } as const;

  if (t.t === "object") return <span className="graph-arg-default">이 오브젝트</span>;
  if (t.t === "boolean") {
    const checked = value === undefined ? port.default === true : value === true;
    return <input {...common} type="checkbox" checked={checked} onChange={(e) => commit(e.target.checked)} />;
  }
  if (t.t === "enum" || t.t === "key" || t.t === "button") {
    const options = t.t === "enum" ? [...t.values] : t.t === "key" ? Object.keys(KEY_CODES) : ["left", "right", "middle"];
    const current = typeof value === "string" ? value : typeof port.default === "string" ? port.default : "";
    return (
      <select {...common} value={current} onChange={(e) => commit(e.target.value)}>
        {!options.includes(current) && <option value={current}>{current || "선택"}</option>}
        {options.map((o) => (
          <option key={o} value={o}>
            {o}
          </option>
        ))}
      </select>
    );
  }
  if (t.t === "number" || t.t === "integer" || t.t === "numeric") return <NumberArg {...common} value={value ?? port.default} integer={t.t === "integer"} onCommit={commit} />;
  return <TextArg {...common} value={value ?? port.default} onCommit={commit} />;
}

function NumberArg({ value, integer, onCommit, ...rest }: { value: unknown; integer: boolean; onCommit: (v: unknown) => void; className: string; "data-arg": string }) {
  const [text, setText] = useState(value === undefined ? "" : String(value));
  useEffect(() => setText(value === undefined ? "" : String(value)), [value]);
  return (
    <input
      {...rest}
      type="text"
      inputMode="decimal"
      value={text}
      placeholder="0"
      onPointerDown={stop}
      onChange={(e) => {
        setText(e.target.value);
        const n = Number(e.target.value);
        if (e.target.value.trim() !== "" && Number.isFinite(n) && (!integer || Number.isInteger(n))) onCommit(n);
      }}
      onBlur={() => setText(value === undefined ? "" : String(value))}
    />
  );
}

function TextArg({ value, onCommit, ...rest }: { value: unknown; onCommit: (v: unknown) => void; className: string; "data-arg": string }) {
  return <input {...rest} type="text" value={value === undefined ? "" : String(value)} onPointerDown={stop} onChange={(e) => onCommit(e.target.value)} />;
}
