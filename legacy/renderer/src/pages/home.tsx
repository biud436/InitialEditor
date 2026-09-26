/* eslint-disable react-hooks/exhaustive-deps */
import React, { useCallback } from 'react';

import { MainContainer } from '../components/MainContainer';
import { useRecoilState } from 'recoil';
import Widget from '../components/window/Widget';

import { observer } from 'mobx-react';

import Viewer from '../components/initial/InitialViewer';
import { WindowState, WindowType } from '@store/window';
import { useMapDocument } from '@hooks/useMapDocument';
import { useToast } from '@hooks/useToast';
import App from 'initial-editor/dist/app';

const Home = observer(() => {
  const [, setPanel] = useRecoilState(WindowState);
  const mapDocument = useMapDocument();
  const notify = useToast();

  const openWindow = useCallback(
    ({ path }: { path: string }) => {
      const windowName = path.slice(1);
      setPanel({
        currentWindow: windowName as WindowType,
      });
    },
    [setPanel],
  );

  /**
   * 맵 저장 (Ctrl+S). 경로가 이미 있으면 그 자리에 다시 쓰고,
   * 처음 저장하는 맵이면 내보내기 대화상자로 경로를 정하게 한다.
   */
  const saveMap = useCallback(async () => {
    if (!mapDocument.info().path) {
      setPanel({ currentWindow: 'exportMap' });
      return;
    }
    try {
      const result = await mapDocument.save();
      const notes = [`${result.path} 저장 (${result.bytes} 바이트)`];
      if (result.droppedTiles > 0) {
        notes.push(`타일셋 밖 타일 ${result.droppedTiles}칸은 빈 칸으로 저장했습니다`);
      }
      notify(notes.join('\n'), result.droppedTiles > 0 ? 'warn' : 'info');
    } catch (e) {
      notify(`맵 저장 실패: ${(e as Error).message}`, 'error');
    }
  }, [mapDocument, notify, setPanel]);

  const bindFunctions = useCallback(() => {
    if (App.GetInstance()) {
      App.GetInstance().on('openWindow', openWindow);
      App.GetInstance().on('saveMap', () => void saveMap());
    }
  }, []);

  return (
    <React.Fragment>
      <Viewer callback={bindFunctions} />
      <MainContainer />
      <Widget />
    </React.Fragment>
  );
});

export default Home;
