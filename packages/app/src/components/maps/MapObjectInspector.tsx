// 맵 오브젝트 인스펙터. 활성 문서가 맵이면 인스펙터 패널이 이것을 그린다.
//   하나 고름: id (Enter나 초점을 잃으면 이름 바꾸기, 겹치면 거부, Escape는 취소), 타입, x, y, 띠와 사각형은 폭과 높이,
//             그다음 스키마 칸마다 입력 하나. rangeMin/rangeMax 칸은 "순찰 범위" 한 줄로 묶는다
//   같은 타입 여럿: 함께 고쳐도 뜻이 있는 칸(enum, boolean)만, 묶음 명령 하나로
//   아무것도 안 고름: 맵 요약 (크기, 레이어, 타입별 수)과 스키마 출처
//   대상이 확장 레이어: 그 레이어의 Inspector 자리 (docs/plans/e5-rpg.md 2.3). Inspector 가 없거나 상태가 없으면 위의 규칙대로
// 변경은 전부 objectTools/actions.ts를 거쳐 명령이 된다.

import type { MapLayerInspectorProps } from "@initial-editor/ext-tilemap";
import { bigIntText, stringifyJsonLossless, typeOf, type FieldSpec, type MapDocument, type MapObject, type ObjectProblem, type ObjectTypeSchema } from "@initial-editor/ext-tilemap/model";
import { observer } from "mobx-react-lite";
import { useEffect, useRef, useState, type ComponentType } from "react";
import { useEditor } from "../../editor/EditorContext";
import { clearObjectProps, renameMapObject, selectProblem, setObjectGeometry, setObjectsProp, setRangeAround } from "../../editor/maps/objectTools/actions";
import { bulkEditableFields, groupObjects, PATROL_RADIUS, rangeFields } from "../../editor/maps/objectTools/rules";
import { asMapDocument } from "../../editor/maps/schemaStore";
import { FieldRow, NumberField, OptionalNumberField, SchemaFieldInput } from "@initial-editor/ui";
import "./MapObjectInspector.css";

export const RANGE_LABEL = "순찰 범위";

function sameValue(values: unknown[]): unknown {
  return values.length > 0 && values.every((v) => v === values[0]) ? values[0] : null;
}

/** 칸에 보일 값: 2^53을 넘는 정수(맵 파일의 표식 글)는 bigint로 넘겨 숫자 그대로 보인다 */
function shownValue(v: unknown): unknown {
  const digits = bigIntText(v);
  return digits === null ? v : BigInt(digits);
}

function shownNumber(v: unknown): number | bigint | undefined {
  const shown = shownValue(v);
  return typeof shown === "number" || typeof shown === "bigint" ? shown : undefined;
}

function prefix(doc: MapDocument, id: string, key: string): string {
  return `map:${doc.path ?? doc.title}:${id}:${key}`;
}

const IdField = observer(function IdField({ doc, object }: { doc: MapDocument; object: MapObject }) {
  const editor = useEditor();
  const [text, setText] = useState(object.id);
  const [focused, setFocused] = useState(false);
  // Escape로 초점을 놓으면 blur에서 이름을 바꾸지 않는다
  const cancelled = useRef(false);
  useEffect(() => {
    if (!focused) setText(object.id);
  }, [object.id, focused]);
  const commit = () => {
    if (text.trim() !== object.id && !renameMapObject(editor, doc, object.id, text)) setText(object.id);
  };
  return (
    <input
      className="input field-text"
      value={text}
      aria-label="id"
      data-testid="map-inspector-id"
      onChange={(e) => setText(e.target.value)}
      onFocus={() => {
        cancelled.current = false;
        setFocused(true);
      }}
      onBlur={() => {
        setFocused(false);
        if (cancelled.current) {
          cancelled.current = false;
          setText(object.id);
          return;
        }
        commit();
      }}
      onKeyDown={(e) => {
        if (e.key === "Enter") {
          e.preventDefault();
          e.currentTarget.blur();
        } else if (e.key === "Escape") {
          e.preventDefault();
          cancelled.current = true;
          setText(object.id);
          e.currentTarget.blur();
        }
      }}
    />
  );
});

function ClearButton({ onClick, testId, label }: { onClick: () => void; testId: string; label: string }) {
  return (
    <button type="button" className="btn btn-ghost map-field-clear" onClick={onClick} data-testid={testId} title={`${label} 지우기 (칸을 파일에서 뺀다)`}>
      지우기
    </button>
  );
}

const RangeRow = observer(function RangeRow({ doc, object, min, max }: { doc: MapDocument; object: MapObject; min: FieldSpec; max: FieldSpec }) {
  const lo = object.props[min.name];
  const hi = object.props[max.name];
  const set = (field: FieldSpec, v: number, session: string) => setObjectsProp(doc, [object.id], field.name, v, session);
  const clear = () => clearObjectProps(doc, object.id, [min.name, max.name]);
  return (
    <div className="map-range" data-testid="map-range">
      <FieldRow label={RANGE_LABEL} hint={`${min.label} (${min.name}) ~ ${max.label} (${max.name})`}>
        <OptionalNumberField
          value={shownNumber(lo)}
          onChange={(v, s) => set(min, v, s)}
          sessionPrefix={prefix(doc, object.id, min.name)}
          integer={min.type === "integer"}
          min={min.min}
          max={min.max}
          testId={`map-field-${min.name}`}
          ariaLabel={min.label}
        />
        <span className="muted map-range-sep">~</span>
        <OptionalNumberField
          value={shownNumber(hi)}
          onChange={(v, s) => set(max, v, s)}
          sessionPrefix={prefix(doc, object.id, max.name)}
          integer={max.type === "integer"}
          min={max.min}
          max={max.max}
          testId={`map-field-${max.name}`}
          ariaLabel={max.label}
        />
      </FieldRow>
      <div className="map-range-actions">
        <button type="button" className="btn" onClick={() => setRangeAround(doc, object.id)} data-testid="map-range-around" title={`${min.label}, ${max.label} 을(를) x ${object.x} 기준으로 (맵 폭 안으로 자른다)`}>
          현재 위치 기준 ±{PATROL_RADIUS}
        </button>
        {(lo !== undefined || hi !== undefined) && !min.required && !max.required && <ClearButton onClick={clear} testId="map-range-clear" label={RANGE_LABEL} />}
      </div>
    </div>
  );
});

const SchemaFields = observer(function SchemaFields({ doc, object, spec }: { doc: MapDocument; object: MapObject; spec: ObjectTypeSchema }) {
  const range = rangeFields(spec);
  return (
    <div className="inspector-section" data-testid="map-inspector-fields">
      <div className="inspector-subtitle">속성</div>
      {spec.fields.length === 0 && <div className="muted inspector-note">이 타입은 칸이 없다</div>}
      {spec.fields.map((f) => {
        if (range && f === range.max) return null;
        if (range && f === range.min) return <RangeRow key="range" doc={doc} object={object} min={range.min} max={range.max} />;
        const value = object.props[f.name];
        return (
          <div key={f.name} className="map-field" data-testid="map-field-row" data-field={f.name}>
            <FieldRow label={f.label} hint={`${f.name} (${f.type}${f.required ? ", 필수" : ""})`}>
              <SchemaFieldInput field={f} value={shownValue(value)} onChange={(v, s) => setObjectsProp(doc, [object.id], f.name, v, s)} sessionPrefix={prefix(doc, object.id, f.name)} testId={`map-field-${f.name}`} />
              {!f.required && value !== undefined && <ClearButton onClick={() => setObjectsProp(doc, [object.id], f.name, undefined)} testId={`map-field-${f.name}-clear`} label={f.label} />}
            </FieldRow>
          </div>
        );
      })}
    </div>
  );
});

const ProblemList = observer(function ProblemList({ doc, problems, testId }: { doc: MapDocument; problems: ObjectProblem[]; testId: string }) {
  const editor = useEditor();
  return (
    <div className="inspector-section inspector-problems" data-testid={testId} data-count={problems.length}>
      <div className="inspector-subtitle">검사 {problems.length === 0 ? <span className="muted">(문제 없음)</span> : <span className="inspector-problem-count">{problems.length}</span>}</div>
      {problems.map((p, i) => (
        <div key={i} className={"inspector-problem is-" + p.severity + (p.objectId ? " is-link" : "")} data-testid="map-inspector-problem" onClick={() => selectProblem(editor, doc, p)}>
          <span className="inspector-problem-where">{p.location}</span>
          <span>{p.message}</span>
        </div>
      ))}
    </div>
  );
});

const SingleObject = observer(function SingleObject({ doc, object }: { doc: MapDocument; object: MapObject }) {
  const spec = typeOf(doc.schema, object.type);
  const sized = spec?.shape === "band" || spec?.shape === "rect" || (!spec && object.width !== undefined);
  const tall = spec?.shape === "rect" || (!spec && object.height !== undefined);
  const problems = doc.problems.filter((p) => p.objectId === object.id);
  const geometry = (field: "x" | "y" | "width" | "height", v: number, s: string) => setObjectGeometry(doc, object.id, field, v, s);
  return (
    <div className="inspector" data-testid="map-object-inspector" data-selection="1" data-object={object.id}>
      <div className="inspector-head">
        <span className={"map-swatch is-" + (spec?.color ?? "muted")} aria-hidden="true" />
        <span className="inspector-title">{object.id}</span>
        <span className="muted" data-testid="map-inspector-type">
          {spec?.label ?? object.type}
        </span>
      </div>
      <div className="inspector-body">
        <div className="inspector-section" data-testid="map-inspector-common">
          <FieldRow label="id" hint="맵 안에서 유일해야 한다">
            <IdField doc={doc} object={object} />
          </FieldRow>
          <FieldRow label="타입" hint={object.type}>
            <span className="map-inspector-typename">{spec ? `${spec.label} (${object.type})` : `${object.type} (스키마에 없음)`}</span>
          </FieldRow>
          <FieldRow label="x">
            <NumberField value={object.x} onChange={(v, s) => geometry("x", v, s)} sessionPrefix={prefix(doc, object.id, "x")} step={1} testId="map-inspector-x" ariaLabel="x" />
          </FieldRow>
          <FieldRow label="y">
            <NumberField value={object.y} onChange={(v, s) => geometry("y", v, s)} sessionPrefix={prefix(doc, object.id, "y")} step={1} testId="map-inspector-y" ariaLabel="y" />
          </FieldRow>
          {sized && (
            <FieldRow label="폭" hint="픽셀">
              <OptionalNumberField value={object.width} onChange={(v, s) => geometry("width", v, s)} sessionPrefix={prefix(doc, object.id, "width")} min={1} testId="map-inspector-width" ariaLabel="폭" />
            </FieldRow>
          )}
          {tall && (
            <FieldRow label="높이" hint="픽셀">
              <OptionalNumberField value={object.height} onChange={(v, s) => geometry("height", v, s)} sessionPrefix={prefix(doc, object.id, "height")} min={1} testId="map-inspector-height" ariaLabel="높이" />
            </FieldRow>
          )}
        </div>
        {spec ? (
          <SchemaFields doc={doc} object={object} spec={spec} />
        ) : (
          <div className="inspector-section">
            <div className="muted inspector-note">스키마에 없는 타입이라 속성 폼이 없다. props 는 파일에 그대로 남는다</div>
            {Object.keys(object.props).length > 0 && <pre className="map-raw-props">{stringifyJsonLossless(object.props, 2)}</pre>}
          </div>
        )}
        <ProblemList doc={doc} problems={problems} testId="map-inspector-problems" />
      </div>
    </div>
  );
});

const ManyObjects = observer(function ManyObjects({ doc, objects }: { doc: MapDocument; objects: MapObject[] }) {
  const types = new Set(objects.map((o) => o.type));
  const spec = types.size === 1 ? typeOf(doc.schema, objects[0].type) : undefined;
  const ids = objects.map((o) => o.id);
  const fields = spec ? bulkEditableFields(spec) : [];
  const problems = doc.problems.filter((p) => p.objectId !== undefined && ids.includes(p.objectId));
  return (
    <div className="inspector" data-testid="map-object-inspector" data-selection={objects.length}>
      <div className="inspector-head">
        <span className="inspector-title">{objects.length}개 선택</span>
        <span className="muted" data-testid="map-inspector-type">
          {spec ? spec.label : types.size === 1 ? objects[0].type : `타입 ${types.size}가지`}
        </span>
      </div>
      <div className="inspector-body">
        <div className="inspector-section" data-testid="map-inspector-fields">
          {types.size > 1 && <div className="muted inspector-note">타입이 다르다. 같은 타입만 고르면 함께 고칠 칸이 보인다</div>}
          {spec && fields.length === 0 && <div className="muted inspector-note">함께 고칠 칸(고르기, 체크)이 없다</div>}
          {fields.map((f) => (
            <div key={f.name} className="map-field" data-testid="map-field-row" data-field={f.name}>
              <FieldRow label={f.label} hint={`${f.name}: 고른 ${objects.length}개를 한 번에 바꾼다`}>
                <SchemaFieldInput field={f} value={shownValue(sameValue(objects.map((o) => o.props[f.name])))} onChange={(v) => setObjectsProp(doc, ids, f.name, v)} sessionPrefix={`map:${ids.join(",")}:${f.name}`} testId={`map-field-${f.name}`} />
              </FieldRow>
            </div>
          ))}
        </div>
        <ProblemList doc={doc} problems={problems} testId="map-inspector-problems" />
      </div>
    </div>
  );
});

const MapSummary = observer(function MapSummary({ doc }: { doc: MapDocument }) {
  const editor = useEditor();
  const store = editor.mapSchema;
  const m = doc.model;
  const groups = groupObjects(m.objects, doc.schema).filter((g) => g.objects.length > 0);
  const schema = doc.schema;
  return (
    <div className="inspector" data-testid="map-object-inspector" data-selection="0">
      <div className="inspector-head">
        <span className="inspector-title">{m.name || doc.title}</span>
        <span className="muted">맵, 오브젝트 {m.objects.length}개</span>
      </div>
      <div className="inspector-body">
        <div className="inspector-section" data-testid="map-summary">
          <FieldRow label="크기">
            <span className="map-summary-list" data-testid="map-summary-size">
              {m.width} x {m.height} 칸, 칸 {m.tileWidth} x {m.tileHeight} px, 전체 {m.pixelWidth} x {m.pixelHeight} px
            </span>
          </FieldRow>
          <FieldRow label="레이어" hint={m.layers.map((l) => l.name).join(", ")}>
            <span className="map-summary-list">
              {m.layers.length}개: {m.layers.map((l) => l.name).join(", ")}
              {m.collision ? ", 통행 있음" : ""}
            </span>
          </FieldRow>
          <FieldRow label="오브젝트">
            <span className="map-summary-list" data-testid="map-summary-counts">
              {groups.length === 0 ? "없음" : groups.map((g) => `${g.label} ${g.objects.length}`).join(", ")}
            </span>
          </FieldRow>
          <FieldRow label="스키마" hint={store?.path}>
            <span className="map-summary-list" data-testid="map-summary-schema" data-source={store?.source ?? "none"}>
              {store?.error ? (
                <span className="map-schema-error">{store.error}</span>
              ) : schema ? (
                `${store?.path ?? "프로젝트"}, 타입 ${schema.types.length}개, 여기서 실행 ${schema.play ? "있음" : "없음"}`
              ) : (
                `없음 (${store?.path ?? "resources/schema/map-objects.json"} 을(를) 만들면 타입별 폼이 생긴다)`
              )}
            </span>
          </FieldRow>
        </div>
        <div className="panel-hint">맵 오브젝트 목록이나 맵 뷰에서 오브젝트를 고르면 속성이 보인다</div>
        <ProblemList doc={doc} problems={doc.objectProblems} testId="map-inspector-problems" />
      </div>
    </div>
  );
});

/** 대상 확장 레이어의 인스펙터. 그릴 것이 없으면 null */
function layerInspectorFor(editor: ReturnType<typeof useEditor>, doc: MapDocument) {
  if (doc.target.kind !== "ext") return null;
  const spec = editor.tilemap?.layers.get(doc.target.id);
  const state = doc.layerState(doc.target.id);
  const Inspector = spec?.Inspector as ComponentType<MapLayerInspectorProps> | undefined;
  if (!spec || !state || !Inspector) return null;
  return (
    <div className="map-layer-inspector" data-testid="map-layer-inspector" data-layer={spec.id}>
      <Inspector document={doc} state={state} />
    </div>
  );
}

export const MapObjectInspector = observer(function MapObjectInspector() {
  const editor = useEditor();
  const doc = asMapDocument(editor.documents.active);
  if (!doc) return null;
  const layer = layerInspectorFor(editor, doc);
  if (layer) return layer;
  const objects = doc.selectedIds.map((id) => doc.model.findObject(id)).filter((o): o is MapObject => !!o);
  if (objects.length === 0) return <MapSummary doc={doc} />;
  if (objects.length === 1) return <SingleObject key={objects[0].id} doc={doc} object={objects[0]} />;
  return <ManyObjects doc={doc} objects={objects} />;
});
