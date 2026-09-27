// 브라우저 모드의 에디터는 엔진을 띄우지 못한다 (러너의 unavailableReason). 여기서 실행 커맨드를 그대로 돌리려고
// 에디터의 러너를 감싼다: 띄울 수 있다고 답하고, start에 넘긴 옵션을 모으고, 엔진은 띄우지 않는다.
// 나머지 멤버는 원래 러너로 보낸다. 돌려주는 함수로 원래 러너를 되돌린다.
// installRunCapture는 page.evaluate에 소스로 넘기므로 바깥 이름을 쓰지 않는다.

/** 러너의 start 옵션 (packages/app/src/editor/runner/RunnerStore.ts의 StartOptions). 지켜볼 것(watch)을 넘겼으면 watch 가 "function" 이다 */
export interface RunStartOptions {
  scene?: string;
  env?: Record<string, string>;
  watch?: "function";
}

export interface RunnerHolder {
  runner: object;
}

export function installRunCapture(holder: RunnerHolder, sink: RunStartOptions[]): () => void {
  const real = holder.runner;
  holder.runner = new Proxy(real, {
    get(target, key) {
      if (key === "unavailableReason") return null;
      if (key === "startHint") return undefined;
      if (key === "start") {
        return async (opts?: { scene?: string; env?: Record<string, string>; watch?: unknown }) => {
          const copy = JSON.parse(JSON.stringify(opts ?? {})) as RunStartOptions;
          if (typeof opts?.watch === "function") copy.watch = "function";
          sink.push(copy);
        };
      }
      return Reflect.get(target, key, target);
    },
  });
  return () => {
    holder.runner = real;
  };
}
