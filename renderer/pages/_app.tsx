import React from "react";
import type { AppProps } from "next/app";
import "../styles/globals.css";
import { ThemeProvider } from "styled-components";
import { GlobalStyle } from "../styles/global-style";
import Head from "next/head";
import Script from "next/script";

function MyApp({ Component, pageProps }: AppProps) {
    return (
        <>
            <ThemeProvider theme={{}}>
                <Component {...pageProps} />
            </ThemeProvider>
        </>
    );
}

export default MyApp;
