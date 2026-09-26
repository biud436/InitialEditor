import React, {
  Suspense,
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from 'react';
import Draggable from 'react-draggable';
import styled from 'styled-components';
import { useClose } from '@hooks/useClose';
import { useBridgeClient, useBridgeWatch } from '@hooks/useBridge';
import type { BridgeMessage } from 'initial-editor';

const CodeEditor = React.lazy(() => import('../CodeEditor'));

const AUTO_RELOAD_KEY = 'initial-editor.script-auto-reload';
const NEW_SCRIPT_TEMPLATE = (name: string) =>
  `-- ${name}\n-- Initial2D 스크립트. 저장하면 실행 중인 게임이 다시 시작됩니다.\n\n`;

function loadAutoReload(): boolean {
  try {
    const v = localStorage.getItem(AUTO_RELOAD_KEY);
    return v === null ? true : v === '1';
  } catch {
    return true;
  }
}

function timeStamp(): string {
  const d = new Date();
  const p = (n: number) => String(n).padStart(2, '0');
  return `${p(d.getHours())}:${p(d.getMinutes())}:${p(d.getSeconds())}`;
}

type Notice = { kind: 'info' | 'error' | 'warn'; text: string };

/**
 * 스크립트 편집기 창.
 * 브리지 서버(Initial2D tools/bridge)로 게임 프로젝트의 scripts/*.lua 목록을 받아 열고,
 * Ctrl+S 로 저장하며, 저장 직후 실행 중인 게임에 HMR push 한다.
 */
export function LuaEditor() {
  const { close } = useClose();
  const bridge = useBridgeClient();
  const frameRef = useRef<HTMLDivElement>(null);

  const [projectName, setProjectName] = useState<string>('');
  const [scripts, setScripts] = useState<string[]>([]);
  const [currentPath, setCurrentPath] = useState<string | null>(null);
  const [content, setContent] = useState('');
  const [savedContent, setSavedContent] = useState('');
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState<Notice | null>(null);
  const [externalChanged, setExternalChanged] = useState(false);
  const [autoReload, setAutoReload] = useState<boolean>(loadAutoReload);
  const [bridgeOk, setBridgeOk] = useState<boolean | null>(null);

  const dirty = currentPath !== null && content !== savedContent;

  // 최신 상태를 이벤트 핸들러에서 읽기 위한 ref
  const stateRef = useRef({ currentPath, dirty, content });
  stateRef.current = { currentPath, dirty, content };

  const refreshList = useCallback(async () => {
    try {
      const info = await bridge.project();
      setProjectName(info.name);
      setScripts(info.scripts);
      setBridgeOk(true);
    } catch (e) {
      setBridgeOk(false);
      setNotice({ kind: 'error', text: (e as Error).message });
    }
  }, [bridge]);

  const openFile = useCallback(
    async (path: string, opts: { silent?: boolean } = {}) => {
      if (stateRef.current.dirty && stateRef.current.currentPath !== path) {
        const ok = window.confirm(
          `${stateRef.current.currentPath} 에 저장하지 않은 변경이 있습니다. 버리고 ${path} 를 열까요?`,
        );
        if (!ok) return;
      }
      setBusy(true);
      try {
        const text = await bridge.readText(path);
        setCurrentPath(path);
        setContent(text);
        setSavedContent(text);
        setExternalChanged(false);
        if (!opts.silent) setNotice({ kind: 'info', text: `${path} 열림` });
      } catch (e) {
        setNotice({ kind: 'error', text: (e as Error).message });
      } finally {
        setBusy(false);
      }
    },
    [bridge],
  );

  const reloadGame = useCallback(async () => {
    try {
      const r = await bridge.reload();
      setNotice({
        kind: 'info',
        text: `게임 리로드 ${r.reply} (${r.files}개 파일, ${r.host}:${r.port}) ${timeStamp()}`,
      });
      return true;
    } catch (e) {
      setNotice({
        kind: 'warn',
        text: `저장은 됐지만 게임 리로드 실패: ${(e as Error).message}`,
      });
      return false;
    }
  }, [bridge]);

  const save = useCallback(async () => {
    const { currentPath: path, content: text } = stateRef.current;
    if (!path || busy) return;
    setBusy(true);
    try {
      const r = await bridge.writeText(path, text);
      setSavedContent(text);
      setExternalChanged(false);
      setNotice({
        kind: 'info',
        text: `${r.path} 저장됨 (${r.bytes} 바이트) ${timeStamp()}`,
      });
      if (autoReload) {
        await reloadGame();
      }
    } catch (e) {
      setNotice({ kind: 'error', text: `저장 실패: ${(e as Error).message}` });
    } finally {
      setBusy(false);
    }
  }, [bridge, autoReload, busy, reloadGame]);

  const createFile = useCallback(async () => {
    const input = window.prompt(
      '새 스크립트 경로 (scripts/ 아래, .lua)',
      'scripts/games/new_game.lua',
    );
    if (!input) return;
    let path = input.trim().replace(/\\/g, '/');
    if (!path.startsWith('scripts/')) path = 'scripts/' + path.replace(/^\/+/, '');
    if (!path.endsWith('.lua')) path += '.lua';
    if (scripts.includes(path)) {
      setNotice({ kind: 'warn', text: `${path} 는 이미 있습니다. 그 파일을 엽니다.` });
      await openFile(path);
      return;
    }
    setBusy(true);
    try {
      await bridge.writeText(path, NEW_SCRIPT_TEMPLATE(path));
      await refreshList();
      await openFile(path);
    } catch (e) {
      setNotice({ kind: 'error', text: `생성 실패: ${(e as Error).message}` });
    } finally {
      setBusy(false);
    }
  }, [bridge, scripts, refreshList, openFile]);

  // 파일 변경 알림: 다른 편집기가 고쳤으면 다시 읽고, 목록이 바뀌었으면 갱신
  const onBridgeMessage = useCallback(
    (message: BridgeMessage) => {
      if (message.type !== 'change') return;
      const { currentPath: path, dirty: isDirty } = stateRef.current;
      if (message.path.endsWith('.lua') && message.event === 'rename') {
        void refreshList();
      }
      if (message.origin !== 'external' || message.path !== path) return;
      if (isDirty) {
        setExternalChanged(true);
      } else {
        void openFile(message.path, { silent: true }).then(() =>
          setNotice({
            kind: 'info',
            text: `${message.path} 가 밖에서 바뀌어 다시 불러왔습니다 ${timeStamp()}`,
          }),
        );
      }
    },
    [refreshList, openFile],
  );
  const watchStatus = useBridgeWatch(onBridgeMessage);

  useEffect(() => {
    void refreshList();
  }, [refreshList]);

  useEffect(() => {
    try {
      localStorage.setItem(AUTO_RELOAD_KEY, autoReload ? '1' : '0');
    } catch {
      /* ignore */
    }
  }, [autoReload]);

  // Ctrl+S / Cmd+S: 창이 떠 있는 동안 어디에 포커스가 있어도 스크립트를 저장한다
  // (캡처 단계라 Ace 나 브라우저의 "페이지 저장" 보다 먼저 잡는다)
  const saveRef = useRef(save);
  saveRef.current = save;
  useEffect(() => {
    const handler = (ev: KeyboardEvent) => {
      if ((ev.ctrlKey || ev.metaKey) && !ev.altKey && ev.key.toLowerCase() === 's') {
        ev.preventDefault();
        ev.stopPropagation();
        void saveRef.current();
      }
    };
    window.addEventListener('keydown', handler, true);
    return () => window.removeEventListener('keydown', handler, true);
  }, []);

  const requestClose = useCallback(() => {
    if (dirty && !window.confirm('저장하지 않은 변경이 있습니다. 창을 닫을까요?')) {
      return;
    }
    close();
  }, [dirty, close]);

  const windowRect = useMemo(() => ({ width: 960, height: 620 }), []);
  // 창 크기를 알고 있으므로 ref 없이 화면 가운데에 놓는다
  const defaultPosition = useMemo(
    () => ({
      x: Math.max(0, Math.floor((window.innerWidth - windowRect.width) / 2)),
      y: Math.max(0, Math.floor((window.innerHeight - windowRect.height) / 2)),
    }),
    [windowRect],
  );
  // 에디터 코어(App)는 window 수준에서 mousedown 을 받아 맵에 타일을 칠하기 시작한다.
  // 창 안에서 시작한 클릭이 맵 그리기로 새지 않게 여기서 전파를 끊는다 (제목줄은 드래그용이라 제외).
  const stopMouseDown = useCallback((ev: React.MouseEvent) => ev.stopPropagation(), []);
  const statusText = useMemo(() => {
    const parts: string[] = [];
    parts.push(
      bridgeOk === null
        ? '브리지 확인 중'
        : bridgeOk
          ? `브리지 연결됨 (${bridge.url}${projectName ? ', ' + projectName : ''})`
          : `브리지 연결 안 됨 (${bridge.url})`,
    );
    parts.push(
      watchStatus === 'open' ? '변경 감시 중' : `변경 감시 ${watchStatus}`,
    );
    return parts.join(' · ');
  }, [bridgeOk, bridge.url, projectName, watchStatus]);

  return (
    <Draggable grid={[16, 16]} handle=".sew-title" defaultPosition={defaultPosition}>
      <Frame
        id="scriptEditor"
        ref={frameRef}
        style={{ width: windowRect.width, height: windowRect.height }}
      >
        <TitleBar className="sew-title">
          <span>
            스크립트 편집기
            {currentPath ? ` — ${currentPath}${dirty ? ' ●' : ''}` : ''}
          </span>
          <TitleButton onClick={requestClose} title="닫기">
            <i className="far fa-window-close" />
          </TitleButton>
        </TitleBar>

        <Body onMouseDown={stopMouseDown}>
          <Sidebar>
            <SidebarHeader>
              <span>scripts/</span>
              <SmallButton onClick={() => void refreshList()} title="목록 새로고침">
                <i className="fas fa-sync-alt" />
              </SmallButton>
              <SmallButton onClick={() => void createFile()} title="새 스크립트">
                <i className="fas fa-plus" />
              </SmallButton>
            </SidebarHeader>
            <FileList>
              {scripts.map(path => (
                <FileItem
                  key={path}
                  $active={path === currentPath}
                  onClick={() => void openFile(path)}
                  title={path}
                >
                  {path.replace(/^scripts\//, '')}
                </FileItem>
              ))}
              {scripts.length === 0 && (
                <EmptyHint>
                  {bridgeOk === false
                    ? '브리지 서버가 필요합니다: Initial2D 저장소에서 node tools/bridge/server.js'
                    : '스크립트가 없습니다'}
                </EmptyHint>
              )}
            </FileList>
          </Sidebar>

          <EditorPane>
            <Toolbar>
              <ToolbarButton
                onClick={() => void save()}
                disabled={!currentPath || busy || !dirty}
                title="저장 (Ctrl+S)"
              >
                <i className="far fa-save" /> 저장
              </ToolbarButton>
              <ToolbarButton
                onClick={() => void reloadGame()}
                disabled={busy}
                title="scripts/*.lua 전체를 실행 중인 게임으로 push"
              >
                <i className="fas fa-play" /> 게임 리로드
              </ToolbarButton>
              <label className="sew-check">
                <input
                  type="checkbox"
                  checked={autoReload}
                  onChange={e => setAutoReload(e.target.checked)}
                />
                저장 시 게임 리로드
              </label>
              <span className="sew-spacer" />
              {busy && <span className="sew-busy">작업 중…</span>}
            </Toolbar>

            {externalChanged && (
              <Banner $kind="warn">
                디스크의 {currentPath} 가 밖에서 바뀌었습니다. 편집 중인 내용을 저장하면 덮어씁니다.
                <BannerButton
                  onClick={() => currentPath && void openFile(currentPath)}
                >
                  다시 불러오기
                </BannerButton>
                <BannerButton onClick={() => setExternalChanged(false)}>
                  무시
                </BannerButton>
              </Banner>
            )}

            <EditorArea>
              {currentPath ? (
                <Suspense fallback={<EmptyHint>편집기 불러오는 중…</EmptyHint>}>
                  <CodeEditor
                    value={content}
                    onChange={setContent}
                    onSave={() => void save()}
                    readOnly={busy && !currentPath}
                  />
                </Suspense>
              ) : (
                <EmptyHint>왼쪽 목록에서 스크립트를 선택하세요.</EmptyHint>
              )}
            </EditorArea>
          </EditorPane>
        </Body>

        <StatusBar $kind={notice?.kind} onMouseDown={stopMouseDown}>
          <span className="sew-status-left">{statusText}</span>
          <span className="sew-status-right" title={notice?.text}>
            {notice?.text ?? ''}
          </span>
        </StatusBar>
      </Frame>
    </Draggable>
  );
}

const Frame = styled.div`
  display: flex;
  flex-direction: column;
  background-color: var(--dark-title-color);
  color: var(--dark-text-color);
  border: 1px solid var(--dark-border-color);
  box-shadow: 2px 2px 6px var(--dark-shadow-color);
  box-sizing: border-box;
  font-family: menu;
  font-size: 0.9rem;
  overflow: hidden;
`;

const TitleBar = styled.div`
  display: flex;
  align-items: center;
  justify-content: space-between;
  height: 2rem;
  padding: 0 0.6rem;
  cursor: move;
  user-select: none;
  background: linear-gradient(
    to bottom,
    var(--dark-title-color) 0%,
    var(--dark-shadow-color) 100%
  );
  border-bottom: 1px solid var(--dark-border-color);
`;

const TitleButton = styled.button`
  background: transparent;
  border: none;
  color: var(--dark-text-color);
  cursor: pointer;
  font-size: 1rem;
  &:hover {
    color: white;
  }
`;

const Body = styled.div`
  display: flex;
  flex: 1;
  min-height: 0;
`;

const Sidebar = styled.div`
  width: 220px;
  display: flex;
  flex-direction: column;
  border-right: 1px solid var(--dark-border-color);
  min-height: 0;
`;

const SidebarHeader = styled.div`
  display: flex;
  align-items: center;
  gap: 0.3rem;
  padding: 0.3rem 0.5rem;
  border-bottom: 1px solid var(--dark-border-color);
  span {
    flex: 1;
    font-weight: bold;
  }
`;

const SmallButton = styled.button`
  background: transparent;
  border: 1px solid transparent;
  color: var(--dark-text-color);
  cursor: pointer;
  padding: 0.1rem 0.3rem;
  &:hover {
    border-color: var(--dark-border-color);
    background: var(--dark-selection-color);
  }
`;

const FileList = styled.ul`
  list-style: none;
  margin: 0;
  padding: 0.2rem 0;
  overflow-y: auto;
  flex: 1;
`;

const FileItem = styled.li<{ $active: boolean }>`
  padding: 0.25rem 0.6rem;
  cursor: pointer;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
  background: ${p => (p.$active ? 'var(--dark-selection-color)' : 'transparent')};
  color: ${p => (p.$active ? 'white' : 'inherit')};
  &:hover {
    background: var(--dark-selection-color);
  }
`;

const EmptyHint = styled.div`
  padding: 1rem;
  opacity: 0.8;
  line-height: 1.5;
`;

const EditorPane = styled.div`
  flex: 1;
  display: flex;
  flex-direction: column;
  min-width: 0;
  min-height: 0;
`;

const Toolbar = styled.div`
  display: flex;
  align-items: center;
  gap: 0.4rem;
  padding: 0.3rem 0.5rem;
  border-bottom: 1px solid var(--dark-border-color);
  .sew-check {
    display: flex;
    align-items: center;
    gap: 0.3rem;
    cursor: pointer;
    input {
      margin: 0;
    }
  }
  .sew-spacer {
    flex: 1;
  }
  .sew-busy {
    opacity: 0.7;
  }
`;

const ToolbarButton = styled.button`
  background-color: var(--dark-title-color);
  color: var(--dark-text-color);
  border: 1px solid var(--dark-border-color);
  padding: 0.2rem 0.6rem;
  cursor: pointer;
  &:hover:not(:disabled) {
    background-color: var(--dark-selection-color);
    color: white;
  }
  &:disabled {
    opacity: 0.5;
    cursor: default;
  }
`;

const Banner = styled.div<{ $kind: 'warn' | 'info' }>`
  padding: 0.3rem 0.6rem;
  background: ${p => (p.$kind === 'warn' ? '#6b5a1e' : 'var(--dark-selection-color)')};
  color: #f5f5f5;
  display: flex;
  align-items: center;
  gap: 0.5rem;
  flex-wrap: wrap;
`;

const BannerButton = styled.button`
  background: rgba(255, 255, 255, 0.15);
  border: 1px solid rgba(255, 255, 255, 0.4);
  color: inherit;
  padding: 0.1rem 0.5rem;
  cursor: pointer;
  &:hover {
    background: rgba(255, 255, 255, 0.3);
  }
`;

const EditorArea = styled.div`
  flex: 1;
  min-height: 0;
  position: relative;
`;

const StatusBar = styled.div<{ $kind?: Notice['kind'] }>`
  display: flex;
  justify-content: space-between;
  gap: 1rem;
  padding: 0.2rem 0.6rem;
  border-top: 1px solid var(--dark-border-color);
  font-size: 0.8rem;
  white-space: nowrap;
  .sew-status-left {
    opacity: 0.8;
    overflow: hidden;
    text-overflow: ellipsis;
  }
  .sew-status-right {
    overflow: hidden;
    text-overflow: ellipsis;
    color: ${p =>
      p.$kind === 'error' ? '#ff8a80' : p.$kind === 'warn' ? '#ffd54f' : 'inherit'};
  }
`;
