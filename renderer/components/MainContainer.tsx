import { MainMenuContainer } from "./menu/MainMenuContainer";
import * as frame from "./frame";
import React, { useEffect } from "react";

export type MyReactNodeProps = { children: React.ReactNode };

export function Wrapper({ children }: MyReactNodeProps) {
    return <div id="wrapper">{children}</div>;
}

export function Container({ children }: MyReactNodeProps) {
    return <div id="container">{children}</div>;
}

export function MyApp() {
    return <div id="app"></div>;
}

export function MainContainer() {
    // const context = useApp();

    // useEffect(() => {
    //     context.app?.start();
    //     context.update(1.0);
    // }, []);

    return (
        <Wrapper>
            <Container>
                <MainMenuContainer />
                <frame.Toolbar />
                <frame.TileSelectWindow />
                <frame.Tilemap />
            </Container>
            <MyApp></MyApp>
        </Wrapper>
    );
}
