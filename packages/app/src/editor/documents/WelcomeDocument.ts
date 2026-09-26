// 시작 탭. 최근 프로젝트와 모드 설명을 보인다 (components/documents/WelcomeView.tsx).

import { Document } from "@initial-editor/core";

export const WELCOME_KIND = "welcome";

export class WelcomeDocument extends Document {
  constructor() {
    super(WELCOME_KIND, null, "시작");
  }

  async save(): Promise<void> {}

  async reload(): Promise<void> {}
}
