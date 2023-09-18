import { Component } from "../component";
export declare namespace InitialEditor {
    enum TILE_ID {
        B = 0,
        C = 256,
        D = 512,
        E = 768,
        A5 = 1536,
        A1 = 2048,
        A2 = 2816,
        A3 = 4352,
        A4 = 5888,
        MAX = 8192
    }
    class TilemapTransformer extends Component {
        start(...args: any[]): Component;
        compress(data: number[]): number[];
    }
}
