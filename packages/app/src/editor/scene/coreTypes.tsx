// 코어 오브젝트 타입 셋 (node, sprite, text) 의 등록과 인스펙터 (docs/plans/e2-scene.md 마일스톤 3).
// 엔진 씬 로더(r1-scene-loader.md 4절)가 지원하는 props 만 칸으로 낸다. 확장 타입은 registerObjectType 으로
// 같은 모양(Inspector 컴포넌트)을 준다. runtime 은 코어 타입에 없다 (로더가 안다).

import { CORE_DEFAULT_PROPS, CORE_OBJECT_TYPES, CORE_TYPE_LABELS, extname, type ExtensionRegistries, type ObjectTypeSpec, type SceneDocument, type SceneObject } from "@initial-editor/core";
import { TILEMAP_TYPE } from "@initial-editor/ext-tilemap";
import { observer } from "mobx-react-lite";
import { runInAction } from "mobx";
import { useEffect, useState, type ComponentType } from "react";
import { useEditor } from "../EditorContext";
import { attachObjectTypeParts } from "../sceneView/objectTypeParts";
import { FieldRow, NumberField, RangeField, TextField } from "@initial-editor/ui";
import { TilemapInspector } from "./tilemapInspector";

export type ObjectInspectorProps = { document: SceneDocument; object: SceneObject };
export type ObjectInspector = ComponentType<ObjectInspectorProps>;

const MIME: Record<string, string> = { png: "image/png", jpg: "image/jpeg", jpeg: "image/jpeg", gif: "image/gif" };

/** props 한 칸을 명령으로 고치는 도우미 */
function useProp(document: SceneDocument, object: SceneObject) {
  const editor = useEditor();
  return (key: string, value: unknown, session?: string) => {
    if (!document.scene.find(object.id)) return;
    editor.sceneTools.apply(document, document.scene.setProp(object.id, key, value, session));
  };
}

function num(v: unknown, fallback: number): number {
  return typeof v === "number" && Number.isFinite(v) ? v : fallback;
}

/** 프로젝트 그림을 Blob URL 로 (인스펙터 미리보기) */
function useImageUrl(path: string): { url: string | null; error: string | null } {
  const editor = useEditor();
  const [state, setState] = useState<{ url: string | null; error: string | null }>({ url: null, error: null });
  useEffect(() => {
    let url: string | null = null;
    let cancelled = false;
    if (!path) {
      setState({ url: null, error: null });
      return;
    }
    void editor.backend
      .readBinary(path)
      .then((data) => {
        if (cancelled) return;
        url = URL.createObjectURL(new Blob([data as BlobPart], { type: MIME[extname(path)] ?? "application/octet-stream" }));
        setState({ url, error: null });
      })
      .catch((e: Error) => {
        if (!cancelled) setState({ url: null, error: e.message });
      });
    return () => {
      cancelled = true;
      if (url) URL.revokeObjectURL(url);
    };
  }, [editor, path]);
  return state;
}

/** 목록에 없는 현재 값도 고를 수 있게 앞에 둔다 */
function optionsWith(list: string[], current: string): string[] {
  return current && !list.includes(current) ? [current, ...list] : list;
}

export const SpriteInspector = observer(function SpriteInspector({ document, object }: ObjectInspectorProps) {
  const editor = useEditor();
  const set = useProp(document, object);
  const p = object.props;
  const image = typeof p.image === "string" ? p.image : "";
  const preview = useImageUrl(image);
  const key = (k: string) => `prop:${object.id}:${k}`;
  const numberRow = (k: string, label: string, opts: { step?: number; min?: number; max?: number; integer?: boolean; hint?: string }) => (
    <FieldRow label={label} hint={opts.hint}>
      <NumberField value={num(p[k], num(CORE_DEFAULT_PROPS.sprite[k], 0))} onChange={(v, s) => set(k, v, s)} sessionPrefix={key(k)} step={opts.step} min={opts.min} max={opts.max} integer={opts.integer} testId={`prop-${k}`} ariaLabel={label} />
    </FieldRow>
  );
  return (
    <div className="inspector-section" data-testid="inspector-sprite">
      <FieldRow label="이미지" hint="resources/ 아래의 png, jpg, gif">
        <select className="select field-select" value={image} onChange={(e) => set("image", e.target.value)} data-testid="prop-image" aria-label="이미지">
          <option value="">(없음)</option>
          {optionsWith(editor.sceneTools.assets.images, image).map((path) => (
            <option key={path} value={path}>
              {path}
            </option>
          ))}
        </select>
      </FieldRow>
      {image && (
        <div className="inspector-preview" data-testid="prop-image-preview">
          {preview.url ? <img src={preview.url} alt={image} /> : <span className="muted">{preview.error ? `읽기 실패: ${preview.error}` : "불러오는 중"}</span>}
        </div>
      )}
      {numberRow("width", "프레임 너비", { min: 0, integer: true, hint: "0 이면 이미지 너비를 프레임 수로 나눈 것" })}
      {numberRow("height", "프레임 높이", { min: 0, integer: true, hint: "0 이면 이미지 높이 전체" })}
      {numberRow("frames", "프레임 수", { min: 1, integer: true, hint: "시트를 너비 방향으로 나눈 수" })}
      {numberRow("frameDelay", "프레임 지연 (ms)", { min: 0, integer: true })}
      {numberRow("startFrame", "시작 프레임", { min: 0, integer: true })}
      {numberRow("endFrame", "끝 프레임", { min: 0, integer: true, hint: "0 이면 한 프레임" })}
      <FieldRow label="반복">
        <input type="checkbox" checked={p.loop !== false} onChange={(e) => set("loop", e.target.checked)} data-testid="prop-loop" aria-label="반복" />
      </FieldRow>
      {numberRow("scale", "배율", { step: 0.1, min: 0 })}
      {numberRow("angle", "회전 (도)", { step: 1 })}
      <FieldRow label="불투명도" hint="0 (투명) .. 255 (불투명)">
        <RangeField value={num(p.opacity, 255)} onChange={(v, s) => set("opacity", v, s)} sessionPrefix={key("opacity")} min={0} max={255} testId="prop-opacity" ariaLabel="불투명도" />
      </FieldRow>
    </div>
  );
});

export const TextInspector = observer(function TextInspector({ document, object }: ObjectInspectorProps) {
  const editor = useEditor();
  const set = useProp(document, object);
  const p = object.props;
  const font = typeof p.font === "string" ? p.font : "";
  const text = typeof p.text === "string" ? p.text : p.text === undefined ? "" : String(p.text);
  return (
    <div className="inspector-section" data-testid="inspector-text">
      <FieldRow label="텍스트" hint="줄바꿈(\n)과 한글 지원">
        <TextField value={text} onChange={(v, s) => set("text", v, s)} sessionPrefix={`prop:${object.id}:text`} multiline testId="prop-text" ariaLabel="텍스트" rows={4} />
      </FieldRow>
      <FieldRow label="폰트" hint="resources/ 아래의 BMFont .fnt 파일입니다. 비워 두면 현재 로드된 비트맵 폰트를 사용합니다.">
        <select className="select field-select" value={font} onChange={(e) => set("font", e.target.value)} data-testid="prop-font" aria-label="폰트">
          <option value="">(게임 기본)</option>
          {optionsWith(editor.sceneTools.assets.fonts, font).map((path) => (
            <option key={path} value={path}>
              {path}
            </option>
          ))}
        </select>
      </FieldRow>
      <div className="inspector-note muted">색상(color)은 적용되지 않습니다. 엔진의 비트맵 폰트 API에 색상 인자가 없으며, 값은 파일에 보존됩니다.</div>
    </div>
  );
});

export function NodeInspector(_props: ObjectInspectorProps) {
  return <div className="inspector-note muted">빈 노드입니다. 렌더링하지 않으며 위치와 컴포넌트(스크립트)만 가집니다.</div>;
}

export const CORE_INSPECTORS: Record<(typeof CORE_OBJECT_TYPES)[number], ObjectInspector> = { node: NodeInspector, sprite: SpriteInspector, text: TextInspector };

export function coreObjectTypeSpecs(): ObjectTypeSpec[] {
  return CORE_OBJECT_TYPES.map((type) => ({ type, label: CORE_TYPE_LABELS[type], icon: type, defaults: CORE_DEFAULT_PROPS[type], Inspector: CORE_INSPECTORS[type] }));
}

/**
 * 코어 타입을 레지스트리에 넣는다 (확장 호스트를 거치지 않는 내부 등록). 씬 뷰가 먼저 같은 타입을 넣어 두었으면
 * (createSceneNode 등) 그 필드를 남기고 라벨과 기본값과 인스펙터만 채운다.
 * 타일맵 확장의 타입에는 등록될 때 앱의 인스펙터를 붙인다.
 */
export function registerCoreObjectTypes(registries: ExtensionRegistries): void {
  runInAction(() => {
    for (const spec of coreObjectTypeSpecs()) {
      const existing = registries.objectTypes.get(spec.type);
      registries.objectTypes.set(spec.type, existing ? { ...spec, ...existing, defaults: spec.defaults, label: spec.label, Inspector: existing.Inspector ?? spec.Inspector } : spec);
    }
  });
  attachObjectTypeParts(registries.objectTypes, TILEMAP_TYPE, { Inspector: TilemapInspector });
}

/** 타입의 인스펙터 (등록된 것, 코어 타입은 내장 것으로 대체) */
export function inspectorFor(spec: ObjectTypeSpec | undefined, type: string): ObjectInspector | null {
  if (spec?.Inspector) return spec.Inspector as ObjectInspector;
  return (CORE_INSPECTORS as Record<string, ObjectInspector | undefined>)[type] ?? null;
}
