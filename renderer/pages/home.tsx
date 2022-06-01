import React, { useEffect, useState } from "react";
import Head from "next/head";

import { MainContainer } from "../components/MainContainer";
import { useRouter } from "next/dist/client/router";
import jQuery from "jquery";
import { useRecoilState } from "recoil";
import { WindowState, WindowType } from "../recoil/window";
import Widget from "../components/window/Widget";
import { InitialStore } from "../packages/store";
import styled from "styled-components";
import { observer } from "mobx-react";
import { fileProvider } from "../store/providers/FileProvider";

const LoadingBlock = styled.div`
    display: flex;
    width: 100%;
    height: 100%;
    justify-content: center;
    align-items: center;
`;

const Home = observer(() => {
    const router = useRouter();
    const [panel, setPanel] = useRecoilState(WindowState);
    const [loading, setLoading] = useState(true);

    useEffect(() => {
        const openWindow = (route: { path: string }) => {
            const currentWindow = route.path.slice(1) ?? "none";
            setPanel({
                currentWindow: currentWindow as WindowType,
            });
        };

        import("../packages")
            .then(() => {
                setLoading(false);
                window.$ = jQuery;
                window.onMounted(() => {
                    if (window.app) {
                        window.app.on("openWindow", openWindow);
                        window.app.on("store:ready", (store: InitialStore) => {
                            const nextHook = store.startHook(window.app);
                            nextHook();
                        });
                    }
                });
            })
            .then(() => {
                const store = InitialStore.GetInstance(window.app);
            })
            .catch((err) => {
                return (
                    <React.Fragment>
                        <Head>
                            <title>Error</title>
                        </Head>
                        <div>
                            <p className="text-xl antialiased">
                                페이지를 렌더링하는 도중에 오류가
                                발생하였습니다.
                            </p>
                        </div>
                    </React.Fragment>
                );
            });

        // test: file
        console.log(fileProvider.rootPath);
    }, []);

    if (loading) {
        return (
            <>
                <React.Fragment>
                    <LoadingBlock>로딩중...</LoadingBlock>
                </React.Fragment>
            </>
        );
    }

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
            <div className="fixed right-0">
                <p className="text-xl text-blue-600 opacity-80 bg-white">
                    테스트 버전입니다.
                </p>
            </div>
            <MainContainer></MainContainer>
            <Widget></Widget>
        </React.Fragment>
    );
});

export default Home;
