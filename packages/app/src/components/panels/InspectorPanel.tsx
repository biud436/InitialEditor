// 인스펙터 (docs/plans/e2-scene.md 마일스톤 3). 활성 씬에서 선택한 오브젝트의 속성.
//   공통: id (초점을 잃거나 Enter 로 이름 바꾸기), x, y (타이핑은 한 세션이 되돌리기 한 번), 표시 여부
//   타입별: registerObjectType 의 Inspector 컴포넌트 (코어 타입은 scene/coreTypes.tsx)
//   스크립트: 논리 이름 목록, 열기, 떼기, 붙이기 (없으면 템플릿으로 만든다)
//   맨 아래: 검사 결과 (document.problems)
// 여러 개를 골랐으면 공통 칸만 보이고 값이 다르면 "여러 값" 이다. 변경은 전부 editor.sceneTools 를 거쳐 명령이 된다.

import type { SceneDocument, SceneObject } from "@initial-editor/core";
import { observer } from "mobx-react-lite";
import { useEffect, useRef, useState } from "react";
import { useEditor } from "../../editor/EditorContext";
import { openAttachScriptDialog } from "../../editor/scene/AttachScriptDialog";
import { compoundCommand } from "../../editor/scene/commands";
import { inspectorFor } from "../../editor/scene/coreTypes";
import { FieldRow, NumberField } from "../../editor/scene/fields";
import { TypeIcon } from "../../editor/scene/typeIcons";
import "./InspectorPanel.css";

export const INSPECTOR_EMPTY = "씬 탭을 열고 오브젝트를 고르면 속성이 보인다";

function sameValue<T>(values: T[]): T | null {
  return values.length > 0 && values.every((v) => v === values[0]) ? values[0] : null;
}

const IdField = observer(function IdField({ object }: { object: SceneObject }) {
  const editor = useEditor();
  const [text, setText] = useState(object.id);
  const [focused, setFocused] = useState(false);
  useEffect(() => {
    if (!focused) setText(object.id);
  }, [object.id, focused]);
  const commit = () => {
    if (text.trim() !== object.id && !editor.sceneTools.rename(object.id, text)) setText(object.id);
  };
  return (
    <input
      className="input field-text"
      value={text}
      aria-label="id"
      data-testid="inspector-id"
      onChange={(e) => setText(e.target.value)}
      onFocus={() => setFocused(true)}
      onBlur={() => {
        setFocused(false);
        commit();
      }}
      onKeyDown={(e) => {
        if (e.key === "Enter") {
          e.preventDefault();
          e.currentTarget.blur();
        } else if (e.key === "Escape") {
          setText(object.id);
          e.currentTarget.blur();
        }
      }}
    />
  );
});

const CommonFields = observer(function CommonFields({ doc, objects }: { doc: SceneDocument; objects: SceneObject[] }) {
  const editor = useEditor();
  const tools = editor.sceneTools;
  const ids = objects.map((o) => o.id);
  const key = ids.join(",");
  const visibleRef = useRef<HTMLInputElement>(null);
  const visible = sameValue(objects.map((o) => o.visible));
  useEffect(() => {
    if (visibleRef.current) visibleRef.current.indeterminate = visible === null;
  }, [visible]);

  const setAxis = (axis: "x" | "y", value: number, session: string) => {
    if (objects.length === 1) {
      tools.apply(doc, doc.scene.setField(objects[0].id, axis, value, session));
      return;
    }
    tools.apply(
      doc,
      doc.scene.moveObjects(
        objects.map((o) => ({ id: o.id, x: axis === "x" ? value : o.x, y: axis === "y" ? value : o.y })),
        session,
      ),
    );
  };
  const setVisible = (value: boolean) => {
    if (objects.length === 1) {
      tools.setVisible(objects[0].id, value);
      return;
    }
    tools.apply(
      doc,
      compoundCommand(
        `표시 여부: ${objects.length}개`,
        objects.map((o) => doc.scene.setField(o.id, "visible", value)),
      ),
    );
  };

  return (
    <div className="inspector-section" data-testid="inspector-common">
      {objects.length === 1 && (
        <FieldRow label="id" hint="씬 안에서 유일해야 한다">
          <IdField object={objects[0]} />
        </FieldRow>
      )}
      <FieldRow label="x">
        <NumberField value={sameValue(objects.map((o) => o.x))} onChange={(v, s) => setAxis("x", v, s)} sessionPrefix={`common:${key}:x`} step={1} testId="inspector-x" ariaLabel="x" />
      </FieldRow>
      <FieldRow label="y">
        <NumberField value={sameValue(objects.map((o) => o.y))} onChange={(v, s) => setAxis("y", v, s)} sessionPrefix={`common:${key}:y`} step={1} testId="inspector-y" ariaLabel="y" />
      </FieldRow>
      <FieldRow label="표시" hint="끄면 그리지 않고 컴포넌트 render 도 부르지 않는다 (update 는 부른다)">
        <input ref={visibleRef} type="checkbox" checked={visible === true} onChange={(e) => setVisible(e.target.checked)} data-testid="inspector-visible" aria-label="표시" />
        {visible === null && <span className="muted field-mixed">여러 값</span>}
      </FieldRow>
    </div>
  );
});

const ScriptsSection = observer(function ScriptsSection({ object }: { object: SceneObject }) {
  const editor = useEditor();
  const tools = editor.sceneTools;
  const language = editor.project.gameJson.script;
  const open = async (name: string) => {
    const path = tools.scriptPath(name);
    if (!(await editor.backend.exists(path).catch(() => false))) {
      editor.toasts.warn(`파일이 없다: ${path} (스크립트 붙이기에서 만들 수 있다)`);
      return;
    }
    await editor.openPath(path);
  };
  return (
    <div className="inspector-section" data-testid="inspector-scripts">
      <div className="inspector-subtitle">
        스크립트 <span className="muted">({language === "mruby" ? "scripts/ruby" : "scripts/lua"} 기준 논리 이름)</span>
      </div>
      {object.scripts.length === 0 && <div className="muted inspector-note">붙은 스크립트가 없다</div>}
      {object.scripts.map((name) => (
        <div key={name} className="inspector-script" data-testid="inspector-script-row" data-name={name}>
          <span className="inspector-script-name" title={tools.scriptPath(name)}>
            {name}
          </span>
          <button type="button" className="btn btn-ghost" onClick={() => void open(name)} data-testid="inspector-script-open" title={tools.scriptPath(name)}>
            열기
          </button>
          <button type="button" className="btn btn-ghost" onClick={() => tools.detachScript(object.id, name)} aria-label={`${name} 떼기`} data-testid="inspector-script-remove" title="떼기">
            ×
          </button>
        </div>
      ))}
      <button type="button" className="btn inspector-attach" onClick={() => void openAttachScriptDialog(editor, object.id)} data-testid="inspector-attach">
        스크립트 붙이기
      </button>
    </div>
  );
});

const ProblemsSection = observer(function ProblemsSection({ doc }: { doc: SceneDocument }) {
  const problems = doc.problems;
  return (
    <div className="inspector-section inspector-problems" data-testid="inspector-problems" data-count={problems.length}>
      <div className="inspector-subtitle">검사 {problems.length === 0 ? <span className="muted">(문제 없음)</span> : <span className="inspector-problem-count">{problems.length}</span>}</div>
      {problems.map((p, i) => (
        <div key={i} className={"inspector-problem is-" + p.severity} data-testid="inspector-problem">
          <span className="inspector-problem-where">{p.location ?? ""}</span>
          <span>{p.message}</span>
        </div>
      ))}
    </div>
  );
});

export const InspectorPanel = observer(function InspectorPanel() {
  const editor = useEditor();
  const tools = editor.sceneTools;
  const doc = tools.activeScene;
  if (!doc) {
    return (
      <div className="panel-body" data-testid="inspector">
        <div className="panel-hint">{INSPECTOR_EMPTY}</div>
      </div>
    );
  }
  const objects = tools.selectedObjects;
  if (objects.length === 0) {
    return (
      <div className="inspector" data-testid="inspector" data-selection="0">
        <div className="inspector-head">
          <span className="inspector-title">{doc.scene.name || doc.title}</span>
          <span className="muted">씬, 오브젝트 {doc.scene.objects.length}개</span>
        </div>
        <div className="panel-hint">계층이나 씬 뷰에서 오브젝트를 고르면 속성이 보인다</div>
        <ProblemsSection doc={doc} />
      </div>
    );
  }
  const single = objects.length === 1 ? objects[0] : null;
  const spec = single ? tools.typeSpec(single.type) : undefined;
  const Inspector = single ? inspectorFor(spec, single.type) : null;
  return (
    <div className="inspector" data-testid="inspector" data-selection={objects.length}>
      <div className="inspector-head">
        {single ? (
          <>
            <span className="inspector-type-icon">
              <TypeIcon icon={spec?.icon ?? single.type} size={16} />
            </span>
            <span className="inspector-title">{single.id}</span>
            <span className="muted">{spec?.label ?? single.type}</span>
          </>
        ) : (
          <span className="inspector-title">{objects.length}개 선택</span>
        )}
      </div>
      <div className="inspector-body">
        <CommonFields doc={doc} objects={objects} />
        {single && Inspector && <Inspector document={doc} object={single} />}
        {single && !Inspector && <div className="muted inspector-note">이 타입({single.type})의 인스펙터가 없다</div>}
        {single && <ScriptsSection object={single} />}
        {!single && <div className="muted inspector-note">여러 개를 골랐다. 타입별 속성과 스크립트는 하나만 골랐을 때 보인다</div>}
        <ProblemsSection doc={doc} />
      </div>
    </div>
  );
});
