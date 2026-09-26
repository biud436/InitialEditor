// 작은 타입 있는 이벤트 발행기. 옛 EventEmitter.ts 를 대신한다.

export type Listener<T> = (payload: T) => void;

export class Emitter<Events extends object> {
  private listeners = new Map<keyof Events, Set<Listener<never>>>();

  on<K extends keyof Events>(event: K, listener: Listener<Events[K]>): () => void {
    let set = this.listeners.get(event);
    if (!set) {
      set = new Set();
      this.listeners.set(event, set);
    }
    set.add(listener as Listener<never>);
    return () => {
      set?.delete(listener as Listener<never>);
    };
  }

  once<K extends keyof Events>(event: K, listener: Listener<Events[K]>): () => void {
    const off = this.on(event, (payload) => {
      off();
      listener(payload);
    });
    return off;
  }

  emit<K extends keyof Events>(event: K, payload: Events[K]): void {
    const set = this.listeners.get(event);
    if (!set) return;
    for (const listener of [...set]) {
      (listener as Listener<Events[K]>)(payload);
    }
  }

  listenerCount(event: keyof Events): number {
    return this.listeners.get(event)?.size ?? 0;
  }

  clear(): void {
    this.listeners.clear();
  }
}

/** 해지 함수 여럿을 한 번에 부르는 도우미 */
export class Disposables {
  private fns: Array<() => void> = [];

  add(fn: () => void): () => void {
    this.fns.push(fn);
    return fn;
  }

  dispose(): void {
    const fns = this.fns;
    this.fns = [];
    for (const fn of fns.reverse()) fn();
  }
}
