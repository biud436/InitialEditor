import React from "react";
import Head from "next/head";
import Link from "next/link";
import Script from "next/script";

import { MainContainer } from "../components/MainContainer";

function Home() {
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
