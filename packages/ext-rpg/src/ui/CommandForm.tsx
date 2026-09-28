// 고른 커맨드 하나의 인자 폼 (e5 문서 4절). 위젯의 값은 setArg 로, 항목은 항목 명령으로 넣는다.
// 타이핑은 초점 한 번이 되돌리기 한 단계이고(합치기 키), 고르기와 누르기는 한 번이 한 단계다.
// 맵 위치 인자(맵 인자와 x, y)가 있는 커맨드는 인자 줄 아래에 맵에서 고르기와 대상 보기 단추가 있다 (location 을 받았을 때).

import type { Command } from "@initial-editor/core";
import { asList, engineLength, field, stringifyJsonLossless, type JsonObject } from "../model/json";
import type { EventEditor } from "../model/commands";
import type { CommandSpec } from "../model/schema";
import { commandSuffix, type CommandPath } from "../model/tree";
import type { EventProblem } from "../model/validate";
import { ArgRow } from "./argWidgets/ArgField";
import type { ArgContext } from "./argWidgets/context";
import { OptionsArg, type OptionOps } from "./argWidgets/OptionsArg";
import { LocationTools, type CommandLocationActions } from "./LocationTools";

interface CommandFormProps {
  editor: EventEditor;
  eventIndex: number;
  path: CommandPath;
  cmd: JsonObject;
  spec: CommandSpec;
  ctx: ArgContext;
  /** 명령을 만들어 문서에 넣는다. 거절되면 false */
  run: (make: () => Command) => boolean;
  /** 이 커맨드 자리의 문제 (엔진 표기) */
  problems: readonly EventProblem[];
  /** 이 커맨드의 엔진 표기 (events[3].commands[2]) */
  location: string;
  /** 맵 위치 인자의 고르기와 보기. 없으면 단추가 없다 */
  locationActions?: CommandLocationActions;
}

function under(location: string, p: EventProblem): boolean {
  return p.location === location || p.location.startsWith(`${location}.`) || p.location.startsWith(`${location}[`);
}

export function CommandForm({ editor, eventIndex, path, cmd, spec, ctx, run, problems, location, locationActions }: CommandFormProps) {
  const optionsList = spec.lists.find((l) => l.perOption);
  const optionsName = optionsList?.perOption;
  // 모델의 항목 명령이 가지와 함께 맞추는 취소 번호 (commands.ts optionsCommand 의 cancel)
  const cancelArg = optionsName ? spec.args.find((a) => a.name === "cancel" && a.type === "integer") : undefined;
  const branches = optionsList ? (asList(field(cmd, optionsList.name)) ?? []) : [];
  const branchSizes = branches.map((b) => engineLength(asList(b) ?? []));
  const known = new Set(["code", ...spec.args.map((a) => a.name), ...spec.lists.map((l) => l.name)]);
  const unknown = Object.keys(cmd).filter((k) => !known.has(k) && cmd[k] !== undefined);
  const own = problems.filter((p) => p.location === location);
  const prefix = `rpg-cmd:${eventIndex}:${commandSuffix(path)}`;

  const setArg = (name: string, value: unknown, session?: string) => run(() => editor.setArg(eventIndex, path, name, value, session ? { mergeKey: session } : {}));
  const ops: OptionOps = {
    add: (at, text) => void run(() => editor.addOption(eventIndex, path, at, text)),
    remove: (k) => void run(() => editor.removeOption(eventIndex, path, k)),
    move: (from, to) => void run(() => editor.moveOption(eventIndex, path, from, to)),
    set: (k, text, session) => void run(() => editor.setOption(eventIndex, path, k, text, session ? { mergeKey: session } : {})),
  };
  if (cancelArg) ops.setCancel = (n) => void setArg(cancelArg.name, n);

  return (
    <div className="rpg-cmd-form" data-testid="rpg-cmd-form">
      <div className="rpg-cmd-form-head">
        <span className="rpg-cmd-form-title">{spec.label}</span>
        <span className="rpg-path" data-testid="rpg-cmd-form-path">
          {location}
        </span>
      </div>
      {spec.ends && <div className="rpg-arg-note muted">이 커맨드 뒤의 커맨드는 실행되지 않음</div>}
      {own.map((p, i) => (
        <div key={i} className={`rpg-arg-problem is-${p.severity}`} data-testid="rpg-cmd-form-problem">
          {p.message}
        </div>
      ))}
      {spec.args
        .filter((a) => a !== cancelArg)
        .map((a) => {
          const at = `${location}.${a.name}`;
          const mine = problems.filter((p) => under(at, p) || (a.name === optionsName && cancelArg && under(`${location}.${cancelArg.name}`, p)));
          const common = { spec: a, value: field(cmd, a.name), ctx, sessionPrefix: `${prefix}:${a.name}`, testId: `rpg-arg-${a.name}`, problems: mine };
          if (a.type === "options") {
            return (
              <ArgRow key={a.name} {...common} onChange={() => undefined}>
                <OptionsArg spec={a} value={common.value ?? []} cancel={cancelArg ? field(cmd, cancelArg.name) : undefined} branchSizes={branchSizes} ops={ops} ctx={ctx} sessionPrefix={common.sessionPrefix} testId={common.testId} />
              </ArgRow>
            );
          }
          return <ArgRow key={a.name} {...common} onChange={(v, s) => void setArg(a.name, v, s)} />;
        })}
      {locationActions?.applies(cmd) && <LocationTools cmd={cmd} path={path} actions={locationActions} />}
      {unknown.length > 0 && (
        <div className="rpg-unknown" data-testid="rpg-cmd-unknown">
          <div className="muted">스키마에 없는 인자 (저장 시 유지)</div>
          {unknown.map((k) => (
            <div key={k} className="rpg-unknown-row">
              <code>{k}</code>: <code>{stringifyJsonLossless(cmd[k])}</code>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
