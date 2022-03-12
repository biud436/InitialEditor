import { MainMenuContainer } from "./menu/MainMenuContainer";
import * as frame from "./frame";
import React from "react";

export function MainContainer() {
    return (
        <div id="wrapper">
            <div className="container">
                <MainMenuContainer />
                <frame.Toolbar />
                <frame.TileSelectWindow />
                <frame.Tilemap />
            </div>
            <div id="app"></div>
        </div>
    );
}
