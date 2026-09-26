// 콘솔 패널의 모델. 엔진 stdout/stderr, 실행기, 브리지, 에디터 자체의 로그가 여기 모인다.
// 줄이 한도를 넘으면 앞을 버린다. `파일:줄:` 링크 파싱은 E1 (실행기)에서 더한다.

import { action, computed, makeObservable, observable } from "mobx";

export type LogLevel = "debug" | "info" | "warn" | "error";
export type LogSource = "engine" | "runner" | "backend" | "editor" | string;

export interface LogEntry {
  id: number;
  ts: number;
  level: LogLevel;
  source: LogSource;
  text: string;
}

export class LogStore {
  entries: LogEntry[] = [];
  filterText = "";
  filterLevel: LogLevel | "all" = "all";
  private nextId = 1;

  constructor(private readonly limit = 5000) {
    makeObservable<LogStore, "nextId">(this, {
      entries: observable.shallow,
      filterText: observable,
      filterLevel: observable,
      nextId: false,
      append: action,
      clear: action,
      setFilter: action,
      visible: computed,
    });
  }

  append(level: LogLevel, source: LogSource, text: string): LogEntry {
    const entry: LogEntry = { id: this.nextId++, ts: Date.now(), level, source, text };
    this.entries.push(entry);
    if (this.entries.length > this.limit) this.entries.splice(0, this.entries.length - this.limit);
    return entry;
  }

  info(source: LogSource, text: string): void {
    this.append("info", source, text);
  }

  warn(source: LogSource, text: string): void {
    this.append("warn", source, text);
  }

  error(source: LogSource, text: string): void {
    this.append("error", source, text);
  }

  clear(): void {
    this.entries = [];
  }

  setFilter(text: string, level: LogLevel | "all" = this.filterLevel): void {
    this.filterText = text;
    this.filterLevel = level;
  }

  get visible(): LogEntry[] {
    const q = this.filterText.trim().toLowerCase();
    return this.entries.filter(
      (e) => (this.filterLevel === "all" || e.level === this.filterLevel) && (q === "" || e.text.toLowerCase().includes(q) || e.source.includes(q)),
    );
  }
}
