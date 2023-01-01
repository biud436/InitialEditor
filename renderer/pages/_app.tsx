import "reflect-metadata";
import React, { useEffect } from "react";
import type { AppProps } from "next/app";
import "../styles/globals.scss";
import { ThemeProvider } from "styled-components";
import { RecoilRoot } from "recoil";
import Store from "electron-store";

export function MyApp({ Component, pageProps }: AppProps) {
    const [store] = React.useState<Store>(new Store());

    useEffect(() => {
        console.log("메뉴 커맨드 >> ");
        console.log(store.get("menuCommands") as any[]);
    }, []);

    return (
        <RecoilRoot>
            <ThemeProvider theme={{}}>
                <Component {...pageProps} />
            </ThemeProvider>
        </RecoilRoot>
    );
}

export default MyApp;
