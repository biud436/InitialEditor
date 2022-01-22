import { Component } from "../Component";

export namespace InitialEditor {
    export enum TILE_ID {
        B = 0,
        C = 256,
        D = 512,
        E = 768,
        A5 = 1536,
        A1 = 2048,
        A2 = 2816,
        A3 = 4352,
        A4 = 5888,
        MAX = 8192,
    }

    export class TilemapTransformer extends Component {
        start(...args: any[]): Component {
            return this;
        }

        compress(data: number[]) {
            let items: number[] = [];

            // Wang Tile 기준, 6 * 8 = 48 간격으로 배치되어야 함
            // 1 * 48 = 48
            // 2 * 48 = 96
            // TODO: 여기에 RPG Maker 호환 코드를 추가해야 함

            items = data;

            return items;
        }
    }
}
