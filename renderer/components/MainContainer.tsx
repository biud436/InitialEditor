import { MainMenuContainer } from "./menu/MainMenuContainer";
import * as frame from "./frame";
import React from "react";

type MyReactNodeProps = { children: React.ReactNode };

function Wrapper({ children }: MyReactNodeProps) {
    return <div id="wrapper">{children}</div>;
}

function Container({ children }: MyReactNodeProps) {
    return <div id="container">{children}</div>;
}

function MyApp() {
    return <div id="app"></div>;
}

export function MainContainer() {
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
