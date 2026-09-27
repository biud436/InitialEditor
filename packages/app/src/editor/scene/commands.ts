// 여러 명령을 되돌리기 한 단계로 묶는다 (삭제와 복제와 붙여넣기가 여러 오브젝트를 한 번에 다룬다).
// 실행은 순서대로, 되돌리기는 거꾸로. 합치기(coalesce)는 하지 않는다. 바꾸는 것이 없는 명령뿐이면 묶음도 그렇다 (unchanged).

import type { Command } from "@initial-editor/core";

export function compoundCommand(label: string, commands: Command[]): Command {
  return {
    label,
    unchanged: commands.every((c) => c.unchanged === true),
    execute() {
      for (const c of commands) c.execute();
    },
    undo() {
      for (let i = commands.length - 1; i >= 0; i--) commands[i].undo();
    },
  };
}
