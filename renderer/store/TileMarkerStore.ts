import { makeAutoObservable } from "mobx";
import styled, { StyledComponent } from "styled-components";

export type TileMarkerState = "pending" | "ready" | "error";

export class TileMarkerStore {
    state: TileMarkerState = "pending";

    constructor() {
        makeAutoObservable(this);
    }

    pending() {
        this.state = "pending";
    }

    ready() {
        this.state = "ready";
    }

    /**
     * 컴포넌트 생성을 lazy하게 합니다.
     * (useMemo 사용 필요)
     *
     * @param tileWidth
     * @param tileHeight
     * @returns
     */
    createElement(
        tileWidth: number,
        tileHeight: number
    ): StyledComponent<"div", any, {}, never> {
        const lazyComponent = styled.div`
        min-width: ${tileWidth}px;
        min-height: ${tileHeight}px;
        width: ${tileWidth}px;
        height: ${tileHeight}px;
        position: "absolute",
        top: "0",
        left: "0",
        margin: "0",
        padding: "0",
        border: "2px dotted white",
        z-index: "0",
        box-sizing: "border-box",
        `;

        this.ready();

        return lazyComponent;
    }
}

export const tileMarker = new TileMarkerStore();
