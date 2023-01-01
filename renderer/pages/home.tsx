import React, { useEffect } from "react";

import { MainContainer } from "../components/MainContainer";
import jQuery from "jquery";
import { useRecoilState } from "recoil";
import { WindowState, WindowType } from "../recoil/window";
import Widget from "../components/window/Widget";

import { observer } from "mobx-react";

import { InitialEditorViewer } from "../components/initial";
import { Meta } from "@components/Meta";

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

    return (
        <React.Fragment>
            <Meta title="Initial Editor" />
            <InitialEditorViewer
                callback={() => {
                    if (window.app) {
                        window.app.on("openWindow", openWindow);
                    }
                }}
            />
            <MainContainer />
            <Widget />
        </React.Fragment>
    );
});

export default Home;
