import { Component } from "../component";

export namespace InitialEditor {
    export enum TILE_ID {
        B = 0,
        C = 256, // 2 ** 8
        D = 512, // (2 ** 8) << 1
        E = 768, // ((2 ** 8) << 1) + (2 ** 8)
        A5 = 1536, //  ((2 ** 8) << 2) + (2 ** 8 << 1)
        A1 = 2048, // (2 ** 8) << 3
        A2 = 2816, // ((2 ** 9) << 2) + (2 ** 9) | (2 ** 8)
        A3 = 4352, // (((2 ** 9) << 2) + (2 ** 9) | (2 ** 8)) + ((2 ** 8) << 2) + (2 ** 8 << 1)
        A4 = 5888, // (((2 ** 9) << 2) + (2 ** 9) | (2 ** 8)) + ((2 ** 8) << 3) + (2 ** 10)
        MAX = 8192, // (2 ** 13)
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
