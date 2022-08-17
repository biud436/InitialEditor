import "reflect-metadata";
import React from "react";
import type { AppProps } from "next/app";
import "../styles/globals.scss";
import { ThemeProvider } from "styled-components";
import { RecoilRoot } from "recoil";

export function MyApp({ Component, pageProps }: AppProps) {
  return (
    <RecoilRoot>
      <ThemeProvider theme={{}}>
        <Component {...pageProps} />
      </ThemeProvider>
    </RecoilRoot>
  );
}

export default MyApp;
