import { makeAutoObservable } from 'mobx';
import { CSSObject } from 'styled-components';

export type TileMarkerState = 'pending' | 'ready' | 'error';

export class TileMarkerStore {
    state: TileMarkerState = 'pending';

    constructor() {
        makeAutoObservable(this);
    }

    pending() {
        this.state = 'pending';
    }

    ready() {
        this.state = 'ready';
    }

    /**
     * 컴포넌트 생성을 lazy하게 합니다.
     *
     * @param tileWidth
     * @param tileHeight
     * @returns
     */
    createElement(tileWidth: number, tileHeight: number): CSSObject {
        return {
            minWidth: `${tileWidth}px`,
            minHeight: `${tileHeight}px`,
            width: `${tileWidth}px`,
            height: `${tileHeight}px`,
            position: 'absolute',
            top: '0',
            left: '0',
            margin: '0',
            padding: '0',
            border: '2px dotted white',
            zIndex: '0',
            boxSizing: 'border-box',
        };
    }
}

export const tileMarker = new TileMarkerStore();
