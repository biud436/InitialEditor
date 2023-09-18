/* eslint-disable react-hooks/exhaustive-deps */
import React, { useCallback, useEffect } from 'react';

import { MainContainer } from '../components/MainContainer';
import jQuery from 'jquery';
import { useRecoilState } from 'recoil';
import Widget from '../components/window/Widget';

import { observer } from 'mobx-react';

import Viewer from '../components/initial/Viewer';
import { WindowState, WindowType } from '@store/window';

const Home = observer(() => {
    const [, setPanel] = useRecoilState(WindowState);

    useEffect(() => {
        window.$ = jQuery;
    }, []);

    const openWindow = ({ path }: { path: string }) => {
        const windowName = path.slice(1);
        setPanel({
            currentWindow: windowName as WindowType,
        });
    };

    const bindFunctions = useCallback(() => {
        if (window.app) {
            window.app.on('openWindow', openWindow);
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
