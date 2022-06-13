import React from "react";
import type { AppProps } from "next/app";
import "../styles/globals.css";
import { ThemeProvider } from "styled-components";
import { RecoilRoot } from "recoil";

export default function MyApp({ Component, pageProps }: AppProps) {
    return (
        <RecoilRoot>
            <ThemeProvider theme={{}}>
                <Component {...pageProps} />
            </ThemeProvider>
        </RecoilRoot>
    );
}
