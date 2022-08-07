import { MainMenuContainer } from "./menu/MainMenuContainer";
import * as frame from "./frame";
import React, { useEffect } from "react";
import { Division } from "./atomics/Wrapper";

export type MyReactNodeProps = { children: React.ReactNode };

export function Wrapper({ children }: MyReactNodeProps) {
    return <Division id="wrapper">{children}</Division>;
}

export function Container({ children }: MyReactNodeProps) {
    return <Division id="container">{children}</Division>;
}

export function MyApp() {
    return <Division id="app"></Division>;
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
