import React from "react";
import type { AppProps } from "next/app";
import "../styles/globals.css";
import { ThemeProvider } from "styled-components";
import { GlobalStyle } from "../styles/global-style";
import Head from "next/head";

function MyApp({ Component, pageProps }: AppProps) {
    return (
        <>
            <Head>
                <meta charSet="UTF-8" />
                <meta
                    name="viewport"
                    content="width=device-width, initial-scale=1.0"
                />
                <title></title>
            </Head>
            <GlobalStyle />
            <ThemeProvider theme={{}}>
                <Component {...pageProps} />
            </ThemeProvider>
        </>
    );
}

export default MyApp;
