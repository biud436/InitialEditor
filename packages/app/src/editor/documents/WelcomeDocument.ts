// 시작 탭. 모드 설명, 프로젝트나 폴더 열기, 최근 목록을 보인다 (components/documents/WelcomeView.tsx).

import { Document } from "@initial-editor/core";

export const WELCOME_KIND = "welcome";

export class WelcomeDocument extends Document {
  constructor() {
    super(WELCOME_KIND, null, "시작");
  }

  async save(): Promise<void> {}

  async reload(): Promise<void> {}
}
