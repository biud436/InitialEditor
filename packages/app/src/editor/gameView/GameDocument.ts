// 게임 탭. 파일이 없는 문서이고 한 번에 하나만 연다 (패널 id 는 doc:game). 내용은 components/documents/GameView.tsx 가 그린다.
// 레이아웃을 되살릴 때는 다시 열지 않는다 (경로가 없어 documentDock 이 탭을 지운다). 실행하면 다시 뜬다.

import { Document } from "@initial-editor/core";

export const GAME_KIND = "game";
export const GAME_TITLE = "게임";

export class GameDocument extends Document {
  constructor() {
    super(GAME_KIND, null, GAME_TITLE);
  }

  async save(): Promise<void> {}

  async reload(): Promise<void> {}
}
