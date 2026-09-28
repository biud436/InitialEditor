// 인스펙터의 컴포넌트 매개변수 (docs/plans/next-goals.md 2절). 붙은 컴포넌트 하나의 선언된 필드를 폼으로 그린다.
//   값이 없는 필드는 선언의 기본값을 보이고, 오브젝트가 가진 값은 표시하고 "기본값으로" 로 지운다
//   object 필드는 씬 오브젝트 id 를 고른다. 선언되지 않은 값은 오류로 보이고 지울 수 있다
//   선언 파일이 없으면 값을 검사 없이 넘긴다는 안내와 값 목록, 깨졌으면 그 이유. 선언 파일은 여기서 열거나 만든다
// SceneLoaderNote: 프로젝트의 씬 로더 사본이 매개변수를 모르면 알리고, 번들 템플릿의 로더로 바꾼다 (덮어쓰기 확인)

import type { ComponentField, SceneObject } from "@initial-editor/core";
import { FieldRow, SchemaFieldInput, type SchemaFieldSpec } from "@initial-editor/ui";
import { observer } from "mobx-react-lite";
import { useEditor } from "../../editor/EditorContext";
import { bundledTemplateSource } from "../../editor/scene/templateFiles";

function fieldSpec(field: ComponentField, objectIds: string[]): SchemaFieldSpec {
  const label = field.label ?? field.key;
  if (field.type === "object") return { name: field.key, type: "enum", label, values: objectIds };
  return {
    name: field.key,
    type: field.type,
    label,
    values: field.values,
    min: field.min,
    max: field.max,
  };
}

function formatValue(value: unknown): string {
  return typeof value === "string" ? value : JSON.stringify(value);
}

export const ComponentParams = observer(function ComponentParams({ object, name }: { object: SceneObject; name: string }) {
  const editor = useEditor();
  const tools = editor.sceneTools;
  const state = tools.declarations.lookup(name);
  const values = object.params[name] ?? {};
  const entries = Object.entries(values);
  const openButton = (label: string) => (
    <button type="button" className="btn btn-ghost inspector-params-open" onClick={() => void tools.openDeclaration(object.id, name)} data-testid="inspector-params-open" title={state?.path}>
      {label}
    </button>
  );
  if (!state) return <div className="inspector-params" data-testid="inspector-params" data-state="loading" />;
  if (state.kind === "broken") {
    return (
      <div className="inspector-params" data-testid="inspector-params" data-state="broken">
        <div className="inspector-params-error">
          선언 오류 ({state.path}): {state.message}
        </div>
        {openButton("선언 파일 열기")}
      </div>
    );
  }
  if (state.kind === "none") {
    return (
      <div className="inspector-params" data-testid="inspector-params" data-state="none">
        {entries.length > 0 && (
          <>
            <div className="muted inspector-params-note">선언 파일 없음. 값 {entries.length}개를 검사 없이 전달</div>
            {entries.map(([key, value]) => (
              <FieldRow key={key} label={key}>
                <code className="inspector-param-raw" data-testid={`param-raw-${key}`}>
                  {formatValue(value)}
                </code>
              </FieldRow>
            ))}
          </>
        )}
        {openButton("매개변수 선언 만들기")}
      </div>
    );
  }
  const fields = state.declaration.fields;
  const declared = new Set(fields.map((f) => f.key));
  const stray = entries.filter(([key]) => !declared.has(key));
  const ids = tools.activeScene?.scene.ids() ?? [];
  return (
    <div className="inspector-params" data-testid="inspector-params" data-state="declared">
      {fields.length === 0 && <div className="muted inspector-params-note">선언된 매개변수 없음</div>}
      {fields.map((f) => {
        const set = Object.prototype.hasOwnProperty.call(values, f.key);
        const label = f.label ?? f.key;
        return (
          <div key={f.key} className={"inspector-param" + (set ? " is-set" : "")} data-testid="inspector-param" data-key={f.key} data-set={set || undefined}>
            <FieldRow label={label} hint={`${f.key} (${f.type}${f.default !== undefined ? `, 기본값 ${formatValue(f.default)}` : ""})`}>
              <SchemaFieldInput
                field={fieldSpec(f, ids)}
                value={set ? values[f.key] : f.default}
                onChange={(v, s) => tools.setParam(object.id, name, f.key, v, s)}
                sessionPrefix={`param:${object.id}:${name}:${f.key}`}
                testId={`param-${f.key}`}
              />
              {set && (
                <button
                  type="button"
                  className="btn btn-ghost"
                  onClick={() => tools.setParam(object.id, name, f.key, undefined)}
                  data-testid={`param-${f.key}-reset`}
                  title={`${label}: 기본값으로 (씬 파일의 params에서 이 값 삭제)`}
                >
                  기본값으로
                </button>
              )}
            </FieldRow>
          </div>
        );
      })}
      {stray.map(([key, value]) => (
        <div key={key} className="inspector-param is-stray" data-testid="inspector-param-stray" data-key={key}>
          <FieldRow label={key} hint="선언되지 않은 매개변수 (엔진이 씬을 거부함)">
            <code className="inspector-param-raw">{formatValue(value)}</code>
            <button type="button" className="btn btn-ghost" onClick={() => tools.setParam(object.id, name, key, undefined)} data-testid={`param-${key}-reset`} title={`${key} 삭제`}>
              삭제
            </button>
          </FieldRow>
        </div>
      ))}
      {openButton("선언 파일 열기")}
    </div>
  );
});

export const SceneLoaderNote = observer(function SceneLoaderNote() {
  const editor = useEditor();
  const loader = editor.sceneTools.loader;
  if (loader.state !== "old") return null;
  const upgrade = async () => {
    const ok = await editor.modals.confirm({
      title: "씬 로더 바꾸기",
      message: `${loader.path}를 에디터에 든 템플릿의 씬 로더(매개변수 지원)로 덮어씀. 로더를 직접 고쳤다면 그 변경은 사라짐`,
      okLabel: "덮어쓰기",
      danger: true,
    });
    if (!ok) return;
    try {
      const written = await loader.upgrade(bundledTemplateSource);
      editor.log.info("editor", `씬 로더 바꿈: ${written.join(", ")}`);
      editor.toasts.success(`씬 로더 바꿈: ${written.join(", ")}`);
    } catch (e) {
      const message = `씬 로더 바꾸기 실패: ${(e as Error).message}`;
      editor.log.error("editor", message);
      editor.toasts.error(message);
    }
  };
  return (
    <div className="inspector-loader-note" data-testid="inspector-loader-old">
      <span>씬 로더({loader.path})가 매개변수를 넘기지 않음. 바꿔야 게임에 반영</span>
      <button type="button" className="btn btn-ghost" onClick={() => void upgrade()} data-testid="inspector-loader-upgrade">
        씬 로더 바꾸기
      </button>
    </div>
  );
});
