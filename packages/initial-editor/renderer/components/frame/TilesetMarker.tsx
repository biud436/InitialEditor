import { Division } from "@components/atomics/Wrapper";
import { MarkerRange } from "libs/initial/tilesetMarker";
import { observer } from "mobx-react-lite";
import { useEffect, useState } from "react";
import styled from "styled-components";
import { BlockSize } from "../../libs/initial/BlockSize";
import { useRaf, useRafLoop, useUpdate } from "react-use";

interface TilesetMarkerPureProps {
    x: number;
    y: number;
    width: number;
    height: number;
}

export const DRAGGING_DELAY = 33;

export interface TilesetMarkerProps {
    config: any;
    width: number;
    height: number;
    isReady: boolean;
    element?: JQuery<HTMLElement>;
    isDraw: boolean;
    isClicked: boolean;
    blockSize: BlockSize;
    touches: Array<{ x: number; y: number }>;
    isDragging: boolean;
    lastTileId: number;
    tiles: number[];
}

export const TilesetMarkerPureElement = styled.div<TilesetMarkerPureProps>`
    min-width: ${(props) => props.width}px;
    min-height: ${(props) => props.height}px;
    width: ${(props) => props.width}px;
    height: ${(props) => props.height}px;
    position: absolute;
    left: ${(props) => props.x}px;
    top: ${(props) => props.y}px;
    margin: 0;
    padding: 0;
    border: 2px dotted yellow;
    z-index: 50;
    box-sizing: border-box;
`;

export const TilesetMarker = observer(() => {
    const [state, setState] = useState<TilesetMarkerPureProps>({
        x: 0,
        y: 0,
        width: 24,
        height: 24,
    });

    return (
        <>
            <TilesetMarkerPureElement
                x={state.x}
                y={state.y}
                width={state.width}
                height={state.height}
            />
        </>
    );
});
