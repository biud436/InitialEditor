import React, { useEffect } from "react";
import Head from "next/head";

import { MainContainer } from "../components/MainContainer";
import { useRouter } from "next/dist/client/router";
import jQuery from "jquery";
import { useRecoilState } from "recoil";
import { WindowState, WindowType } from "../recoil/window";
import Widget from "../components/window/Widget";
import { InitialStore } from "../packages/store";
import Script from "next/script";

export default function Home() {
    const router = useRouter();
    const [panel, setPanel] = useRecoilState(WindowState);

    useEffect(() => {
        const openWindow = (route: { path: string }) => {
            const currentWindow = route.path.slice(1) ?? "none";
            setPanel({
                currentWindow: currentWindow as WindowType,
            });
        };

        import("../packages")
            .then(() => {
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
    });

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
}
