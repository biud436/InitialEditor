import { useRouter } from "next/dist/client/router";
import Head from "next/head";
import React from "react";
import { createGlobalStyle } from "styled-components";

const GlobalStyle = createGlobalStyle`
    body {
        background-color: #858585;
        background-image: url("background.jpg");
        margin: 0;
        padding: 0;
        overflow-y: hidden;
    }

    .flex {
        -webkit-box-flex: 1;
        -ms-flex: 1 1 auto;
        flex: 1 1 auto;
    }

    .loader {
        border: 5px solid rgba(18, 65, 145, 255);
        border-radius: 50%;
        border-top: 5px solid #ffffff;
        width: 40px;
        height: 40px;
        -webkit-animation: spin 1s linear infinite;
        /* Safari */
        animation: spin 1s linear infinite;
        margin: auto;
        left: 0;
        right: 0;
        top: 0px;
        bottom: 0;
        position: fixed;
    }

    /* Safari */
    @-webkit-keyframes spin {
        0% {
            -webkit-transform: rotate(0deg);
        }

        100% {
            -webkit-transform: rotate(360deg);
        }
    }

    @keyframes spin {
        0% {
            transform: rotate(0deg);
        }

        100% {
            transform: rotate(360deg);
        }
    }

    .center {
        border: none !important;
        text-align: center;
    }

    img[alt^="logo"] {
        width: auto;
        height: auto;
    }
`;

export function Splash() {
    return (
        <React.Fragment>
            <Head>
                <meta charSet="UTF-8" />
                <meta http-equiv="X-UA-Compatible" content="IE=edge" />
                <meta
                    name="viewport"
                    content="width=device-width, initial-scale=1.0"
                />
                <title>스플래시 스크린</title>
            </Head>
            <GlobalStyle />
            <body>
                <div className="flex">
                    <img src="/images/logo.png" alt="logo" />
                    <div className="loader"></div>
                </div>
            </body>
        </React.Fragment>
    );
}
