import React, { useEffect } from "react";
import Head from "next/head";

import { MainContainer } from "../components/MainContainer";
import { useRouter } from "next/dist/client/router";
import jQuery from "jquery";
import { useRecoilState } from "recoil";
import { WindowState, WindowType } from "../recoil/window";
import Widget from "../components/window/Widget";

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
                    }
                });
            })
            .catch((err) => {
                console.error(err);
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
            <MainContainer></MainContainer>
            <Widget></Widget>
        </React.Fragment>
    );
}
