import React from "react";
import logoImage from "../public/images/logo.png";
import style from "../styles/splash.module.scss";
import { observer } from "mobx-react";
import { Helmet, HelmetProvider } from "react-helmet-async";

const Splash = observer(() => {
    return (
        <HelmetProvider>
            <React.Fragment>
                <Helmet>
                    <meta charSet="UTF-8" />
                    <meta http-equiv="X-UA-Compatible" content="IE=edge" />
                    <meta
                        name="viewport"
                        content="width=device-width, initial-scale=1.0"
                    />
                    <title>스플래시 스크린</title>
                </Helmet>
                <body className={style.body_splash}>
                    <div className={style.flex}>
                        <image className={style.logo} href={logoImage} />
                        <div className={style.loader}></div>
                    </div>
                </body>
            </React.Fragment>
        </HelmetProvider>
    );
});

export default Splash;
