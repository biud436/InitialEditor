import React from 'react';
import { MainMenuContainer } from './menu/MainMenuContainer';
import * as frame from './frame';
import { Wrapper } from './Wrapper';
import { Container } from './Container';
import { MyApp } from './MyApp';

export interface MyReactNodeProps {
    children: React.ReactNode;
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
