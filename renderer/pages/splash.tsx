import { useRouter } from "next/dist/client/router";
import Head from "next/head";
import React from "react";
import Image from "next/image";
import logoImage from "../public/images/logo.png";
import style from "../styles/splash.module.css";

export default function Splash() {
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
            <body className={style.body_splash}>
                <div className={style.flex}>
                    <Image className={style.logo} src={logoImage} alt="logo" />
                    <div className={style.loader}></div>
                </div>
            </body>
        </React.Fragment>
    );
}
