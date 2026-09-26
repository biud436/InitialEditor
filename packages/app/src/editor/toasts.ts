// 토스트: 짧은 알림 (docs/plans/02-scope-and-screens.md 7절). 결과는 콘솔에, 짧은 알림은 여기에.

import { action, makeObservable, observable } from "mobx";

export type ToastLevel = "info" | "success" | "warn" | "error";

export interface Toast {
  id: number;
  level: ToastLevel;
  text: string;
}

export class ToastStore {
  toasts: Toast[] = [];
  private nextId = 1;
  private timers = new Map<number, ReturnType<typeof setTimeout>>();

  constructor(private readonly defaultTtlMs = 4000) {
    makeObservable<ToastStore, "nextId" | "timers">(this, {
      toasts: observable.shallow,
      nextId: false,
      timers: false,
      show: action,
      dismiss: action,
    });
  }

  show(text: string, level: ToastLevel = "info", ttlMs = this.defaultTtlMs): Toast {
    const toast: Toast = { id: this.nextId++, level, text };
    this.toasts = [...this.toasts, toast];
    if (ttlMs > 0) {
      this.timers.set(
        toast.id,
        setTimeout(() => this.dismiss(toast.id), ttlMs),
      );
    }
    return toast;
  }

  info(text: string): Toast {
    return this.show(text, "info");
  }

  success(text: string): Toast {
    return this.show(text, "success");
  }

  warn(text: string): Toast {
    return this.show(text, "warn");
  }

  error(text: string): Toast {
    return this.show(text, "error", 7000);
  }

  dismiss(id: number): void {
    const timer = this.timers.get(id);
    if (timer) clearTimeout(timer);
    this.timers.delete(id);
    this.toasts = this.toasts.filter((t) => t.id !== id);
  }
}
