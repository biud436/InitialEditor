// 워커 쪽의 전송: 에디터와 메시지(JSON 문자열)를 postMessage 로 주고받는다.

import type { MessageTransport } from "../rpc";

interface WorkerScope {
  postMessage(message: unknown): void;
  addEventListener(type: "message", listener: (e: MessageEvent) => void): void;
  removeEventListener(type: "message", listener: (e: MessageEvent) => void): void;
  close(): void;
}

export function selfTransport(scope: WorkerScope = self as unknown as WorkerScope): MessageTransport {
  return {
    send: (text) => scope.postMessage(text),
    onMessage(listener) {
      const handler = (e: MessageEvent) => {
        if (typeof e.data === "string") listener(e.data);
      };
      scope.addEventListener("message", handler);
      return () => scope.removeEventListener("message", handler);
    },
    onClose: () => () => {},
    close: () => scope.close(),
  };
}
