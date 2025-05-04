import { Component } from "../component";
export declare namespace InitialEditor {
    enum TILE_ID {
        B = 0,
        C = 256,// 2 ** 8
        D = 512,// (2 ** 8) << 1
        E = 768,// ((2 ** 8) << 1) + (2 ** 8)
        A5 = 1536,//  ((2 ** 8) << 2) + (2 ** 8 << 1)
        A1 = 2048,// (2 ** 8) << 3
        A2 = 2816,// ((2 ** 9) << 2) + (2 ** 9) | (2 ** 8)
        A3 = 4352,// (((2 ** 9) << 2) + (2 ** 9) | (2 ** 8)) + ((2 ** 8) << 2) + (2 ** 8 << 1)
        A4 = 5888,// (((2 ** 9) << 2) + (2 ** 9) | (2 ** 8)) + ((2 ** 8) << 3) + (2 ** 10)
        MAX = 8192
    }
    class TilemapTransformer extends Component {
        start(...args: any[]): Component;
        compress(data: number[]): number[];
    }
}
