// 모달: 위험한 것(삭제, 덮어쓰기)은 앱 안의 모달로 한 번 묻는다 (02-scope-and-screens.md 7절).
// 대화상자는 전부 앱 안의 모달이고 폴더 선택만 OS 대화상자다. 그리기는 components/Modals.tsx 가 한다.

import { action, makeObservable, observable } from "mobx";
import type { ReactNode } from "react";

export interface ConfirmOptions {
  title: string;
  message: string;
  okLabel?: string;
  cancelLabel?: string;
  /** 확인 버튼을 위험 색으로 */
  danger?: boolean;
}

export interface PromptOptions {
  title: string;
  label?: string;
  initial?: string;
  placeholder?: string;
  okLabel?: string;
  /** 오류 문구를 돌려주면 확인이 막힌다 */
  validate?: (value: string) => string | null;
}

export interface CustomOptions {
  title: string;
  render: (close: () => void) => ReactNode;
  width?: number;
}

export type ModalSpec =
  | (ConfirmOptions & { kind: "confirm"; id: number; resolve: (ok: boolean) => void })
  | (PromptOptions & { kind: "prompt"; id: number; resolve: (value: string | null) => void })
  | (CustomOptions & { kind: "custom"; id: number; resolve: () => void });

export class ModalStore {
  stack: ModalSpec[] = [];
  private nextId = 1;

  constructor() {
    makeObservable<ModalStore, "nextId" | "push">(this, {
      stack: observable.shallow,
      nextId: false,
      push: action,
      close: action,
    });
  }

  get top(): ModalSpec | null {
    return this.stack.length ? this.stack[this.stack.length - 1] : null;
  }

  private push(spec: ModalSpec): void {
    this.stack = [...this.stack, spec];
  }

  confirm(options: ConfirmOptions): Promise<boolean> {
    return new Promise((resolve) => {
      const id = this.nextId++;
      this.push({ ...options, kind: "confirm", id, resolve: (ok) => this.finish(id, () => resolve(ok)) });
    });
  }

  prompt(options: PromptOptions): Promise<string | null> {
    return new Promise((resolve) => {
      const id = this.nextId++;
      this.push({ ...options, kind: "prompt", id, resolve: (value) => this.finish(id, () => resolve(value)) });
    });
  }

  /** 자유 폼 (설정, 정보). render 가 받는 close 로 닫는다 */
  custom(options: CustomOptions): Promise<void> {
    return new Promise((resolve) => {
      const id = this.nextId++;
      this.push({ ...options, kind: "custom", id, resolve: () => this.finish(id, resolve) });
    });
  }

  /** Escape 나 가림막 클릭. confirm 은 false, prompt 는 null 로 끝난다 */
  close(id: number): void {
    const spec = this.stack.find((s) => s.id === id);
    if (!spec) return;
    if (spec.kind === "confirm") spec.resolve(false);
    else if (spec.kind === "prompt") spec.resolve(null);
    else spec.resolve();
  }

  private finish(id: number, done: () => void): void {
    action(() => {
      this.stack = this.stack.filter((s) => s.id !== id);
    })();
    done();
  }
}
