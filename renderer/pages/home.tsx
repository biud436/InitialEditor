import React, { useEffect, useState } from "react";
import Head from "next/head";

import { MainContainer } from "../components/MainContainer";
import jQuery from "jquery";
import { useRecoilState } from "recoil";
import { WindowState, WindowType } from "../recoil/window";
import Widget from "../components/window/Widget";
import styled from "styled-components";
import { observer } from "mobx-react";

// test
import { useRouter } from "next/router";
import { setResolution } from "libs/electron/window";
import { InitialEditorViewer } from "../components/initial";

const LoadingBlock = styled.div`
    display: flex;
    width: 100%;
    height: 100%;
    justify-content: center;
    align-items: center;
`;

const Home = observer(() => {
    const [panel, setPanel] = useRecoilState(WindowState);
    const [loading, setLoading] = useState(true);
    const router = useRouter();

    useEffect(() => {
        window.$ = jQuery;
        // window.onMounted(() => {
        //     if (window.app) {
        //         window.app.on("openWindow", openWindow);
        //     }
        // });
    }, []);

    const openWindow = ({ path }: { path: string }) => {
        const windowName = path.slice(1);
        setPanel({
            currentWindow: windowName as WindowType,
        });
    };

    return (
        <React.Fragment>
            <Head>
                <meta charSet="UTF-8" />
                <meta
                    name="viewport"
                    content="width=device-width, initial-scale=1.0"
                />
                <title></title>
            </Head>
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
