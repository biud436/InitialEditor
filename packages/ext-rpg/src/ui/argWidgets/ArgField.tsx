// 인자 타입마다 위젯 하나 (엔진 M2 2.3 의 표). ArgRow 는 이름, 위젯, 지우기, 그 자리의 문제를 한 줄로 그린다.

import type { ReactNode } from "react";
import type { EventProblem } from "../../model/validate";
import { AssetArg } from "./AssetArg";
import { BooleanArg, EnumArg, JsonArg, NumberArg, ScalarArg, StringArg, TextArg } from "./basic";
import { ConditionArg } from "./ConditionArg";
import type { ArgWidgetProps } from "./context";
import { FileArg } from "./FileArg";
import { OptionsArg, valueOptionOps } from "./OptionsArg";
import { RefArg } from "./RefArg";
import { RouteArg } from "./RouteArg";
import { WanderArg } from "./WanderArg";

export function ArgField(props: ArgWidgetProps) {
  switch (props.spec.type) {
    case "string":
      return <StringArg {...props} />;
    case "text":
      return <TextArg {...props} />;
    case "integer":
    case "number":
      return <NumberArg {...props} />;
    case "boolean":
      return <BooleanArg {...props} />;
    case "enum":
      return <EnumArg {...props} />;
    case "scalar":
      return <ScalarArg {...props} />;
    case "ref":
      return <RefArg {...props} />;
    case "file":
      return <FileArg {...props} />;
    case "face":
    case "charset":
      return <AssetArg {...props} />;
    case "options":
      return <OptionsArg spec={props.spec} value={props.value ?? []} ops={valueOptionOps(props.value, props.onChange)} ctx={props.ctx} sessionPrefix={props.sessionPrefix} testId={props.testId} />;
    case "route":
      return <RouteArg {...props} />;
    case "condition":
      return <ConditionArg {...props} />;
    case "wander":
      return <WanderArg {...props} />;
    case "json":
      return <JsonArg {...props} />;
    case "list":
      return <span className="muted">커맨드 목록 편집기에서 고친다</span>;
  }
}

/** 제 위젯 안에서 비울 수 있는 타입 (비움 고르기, 없음, 끄기) */
const SELF_CLEARING = new Set(["boolean", "enum", "scalar", "file", "face", "charset", "wander"]);

interface ArgRowProps extends ArgWidgetProps {
  /** 이 인자 자리의 문제 */
  problems?: readonly EventProblem[];
  /** 기본 위젯 대신 그릴 것 (항목처럼 명령이 따로인 인자) */
  children?: ReactNode;
}

export function ArgRow({ problems = [], children, ...props }: ArgRowProps) {
  const { spec, value, onChange, ctx, testId } = props;
  const clearable = !spec.required && value !== undefined && !SELF_CLEARING.has(spec.type);
  return (
    <div className="rpg-arg" data-testid={`${testId}-row`}>
      <div className="rpg-arg-label">
        {spec.label}
        {spec.required && (
          <span className="rpg-arg-required" title="필수">
            *
          </span>
        )}
      </div>
      <div className="rpg-arg-control">
        {children ?? <ArgField {...props} />}
        {clearable && (
          <button type="button" className="btn btn-ghost rpg-mini" disabled={ctx.disabled} aria-label={`${spec.label} 지우기`} data-testid={`${testId}-clear`} onClick={() => onChange(undefined)}>
            지우기
          </button>
        )}
      </div>
      {problems.map((p, i) => (
        <div key={i} className={`rpg-arg-problem is-${p.severity}`} data-testid={`${testId}-problem`}>
          {p.message}
        </div>
      ))}
    </div>
  );
}
