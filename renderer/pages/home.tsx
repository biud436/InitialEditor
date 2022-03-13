import React, { useEffect } from "react";
import Head from "next/head";

import { MainContainer } from "../components/MainContainer";
import { useRouter } from "next/dist/client/router";
import dynamic from "next/dynamic";
import jQuery from "jquery";

function Home() {
    const router = useRouter();

    const openWindow = (route: string) => {
        router.push(router);
    };

    useEffect(() => {
        import("../packages")
            .then(() => {
                window.$ = jQuery;
                window.onMounted(() => {
                    // 외부에서 뷰의 라우터를 호출할 수 있는 인터페이스를 선언합니다.
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
        </React.Fragment>
    );
}

export default Home;
