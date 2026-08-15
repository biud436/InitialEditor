import { useEffect, useMemo, useRef, useState } from 'react';
import {
  BridgeClient,
  BridgeMessage,
  BridgeWatchStatus,
  getBridgeClient,
} from 'initial-editor';

/** 앱 전체가 공유하는 브리지 클라이언트 */
export function useBridgeClient(): BridgeClient {
  return useMemo(() => getBridgeClient(), []);
}

/**
 * 브리지 파일 변경 알림(WebSocket)을 구독한다. 컴포넌트가 살아 있는 동안만 연결한다.
 * onMessage 는 최신 클로저를 쓰도록 ref 로 감싼다.
 */
export function useBridgeWatch(
  onMessage: (message: BridgeMessage) => void,
): BridgeWatchStatus {
  const client = useBridgeClient();
  const [status, setStatus] = useState<BridgeWatchStatus>('connecting');
  const handlerRef = useRef(onMessage);
  handlerRef.current = onMessage;

  useEffect(() => {
    const stop = client.watch(
      message => handlerRef.current(message),
      next => setStatus(next),
    );
    return stop;
  }, [client]);

  return status;
}
