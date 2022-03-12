import React from "react";
import Head from "next/head";
import Link from "next/link";
import { MainContainer } from "../components/MainContainer";

function Home() {
    return (
        <React.Fragment>
            <Head>
                <title></title>
                <link
                    href={`https://fonts.googleapis.com/css2?family=Nanum+Gothic&display=swap`}
                    rel="stylesheet"
                />
                <link
                    rel="stylesheet"
                    href="https://use.fontawesome.com/releases/v5.14.0/css/all.css"
                    integrity="sha384-HzLeBuhoNPvSl5KYnjx0BT+WB0QEEqLprO+NBkkk5gbc67FTaL7XIGa2w1L0Xbgc"
                    crossOrigin="anonymous"
                />
            </Head>
            <MainContainer></MainContainer>
        </React.Fragment>
    );
}

export default Home;
