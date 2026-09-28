// 맵 위치 인자(맵 이동의 대상)의 두 단추: 맵에서 고르기와 대상 보기. 쓸 수 없는 단추는 끄고 이유를 한 줄로 보인다
// (두 단추의 이유가 같으면 한 줄, 다르면 단추 이름을 붙여 따로). 커맨드 폼이 인자 줄 아래에 그린다.

import type { JsonObject } from "../model/json";
import type { CommandPath } from "../model/tree";
import { observer } from "mobx-react-lite";
import { useId } from "react";
import type { LocationBlockers } from "./locationPick";

/** 커맨드 폼이 받는 맵 위치 동작 (이벤트 인스펙터가 레이어 상태와 이벤트 번호를 묶어 넘긴다) */
export interface CommandLocationActions {
  /** 이 커맨드가 맵 위치 인자를 가졌는가 */
  applies(cmd: JsonObject): boolean;
  blockers(cmd: JsonObject): LocationBlockers;
  pick(path: CommandPath): void;
  reveal(path: CommandPath): void;
}

const PICK_LABEL = "맵에서 선택";
const REVEAL_LABEL = "대상 보기";

/** 보일 이유 줄 */
export function blockerNotes(b: LocationBlockers): string[] {
  if (b.pick !== undefined && b.pick === b.reveal) return [b.pick];
  const out: string[] = [];
  if (b.pick !== undefined) out.push(`${PICK_LABEL}: ${b.pick}`);
  if (b.reveal !== undefined) out.push(`${REVEAL_LABEL}: ${b.reveal}`);
  return out;
}

export const LocationTools = observer(function LocationTools({ cmd, path, actions }: { cmd: JsonObject; path: CommandPath; actions: CommandLocationActions }) {
  const noteId = useId();
  const b = actions.blockers(cmd);
  const notes = blockerNotes(b);
  const described = notes.length > 0 ? noteId : undefined;
  return (
    <div className="rpg-location" role="group" aria-label="맵 위치" data-testid="rpg-location">
      <div className="rpg-location-buttons">
        <button
          type="button"
          className="btn rpg-mini"
          disabled={b.pick !== undefined}
          title={b.pick ?? "대상 맵을 열고 타일을 클릭해 x, y 지정"}
          aria-describedby={b.pick !== undefined ? described : undefined}
          data-testid="rpg-location-pick"
          onClick={() => actions.pick(path)}
        >
          {PICK_LABEL}
        </button>
        <button
          type="button"
          className="btn rpg-mini"
          disabled={b.reveal !== undefined}
          title={b.reveal ?? "대상 맵을 열고 x, y 타일을 뷰 가운데에 표시"}
          aria-describedby={b.reveal !== undefined ? described : undefined}
          data-testid="rpg-location-reveal"
          onClick={() => actions.reveal(path)}
        >
          {REVEAL_LABEL}
        </button>
      </div>
      {notes.length > 0 && (
        <div id={noteId} className="rpg-location-notes">
          {notes.map((n) => (
            <div key={n} className="rpg-arg-note muted" data-testid="rpg-location-note">
              {n}
            </div>
          ))}
        </div>
      )}
    </div>
  );
});
