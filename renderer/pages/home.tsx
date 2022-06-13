import React, { forwardRef, useEffect, useMemo, useState } from "react";
import Head from "next/head";

import { MainContainer } from "../components/MainContainer";
import { useRouter } from "next/dist/client/router";
import jQuery from "jquery";
import { useRecoilState } from "recoil";
import { WindowState, WindowType } from "../recoil/window";
import Widget from "../components/window/Widget";
import styled, { CSSObject, StyledComponent } from "styled-components";
import { observer } from "mobx-react";
import { AppContainer } from "../packages/app";

const LoadingBlock = styled.div`
    display: flex;
    width: 100%;
    height: 100%;
    justify-content: center;
    align-items: center;
`;

const Home = observer(() => {
    const [panel, setPanel] = useRecoilState(WindowState);
    const [loading, setLoading] = useState(true);

    return (
        // <AppContainer>
        <React.Fragment>
            <Head>
                <meta charSet="UTF-8" />
                <meta
                    name="viewport"
                    content="width=device-width, initial-scale=1.0"
                />
                <title></title>
            </Head>
            <div className="fixed right-0">
                <p className="text-xl text-blue-600 opacity-80 bg-white">
                    테스트 버전입니다.
                </p>
            </div>

            <MainContainer />
            <Widget />
        </React.Fragment>
        // </AppContainer>
    );
});

export default Home;
