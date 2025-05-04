import { Component } from "../component";
var InitialEditor;
(function (InitialEditor) {
    let TILE_ID;
    (function (TILE_ID) {
        TILE_ID[TILE_ID["B"] = 0] = "B";
        TILE_ID[TILE_ID["C"] = 256] = "C";
        TILE_ID[TILE_ID["D"] = 512] = "D";
        TILE_ID[TILE_ID["E"] = 768] = "E";
        TILE_ID[TILE_ID["A5"] = 1536] = "A5";
        TILE_ID[TILE_ID["A1"] = 2048] = "A1";
        TILE_ID[TILE_ID["A2"] = 2816] = "A2";
        TILE_ID[TILE_ID["A3"] = 4352] = "A3";
        TILE_ID[TILE_ID["A4"] = 5888] = "A4";
        TILE_ID[TILE_ID["MAX"] = 8192] = "MAX";
    })(TILE_ID = InitialEditor.TILE_ID || (InitialEditor.TILE_ID = {}));
    class TilemapTransformer extends Component {
        start(...args) {
            return this;
        }
        compress(data) {
            let items = [];
            // Wang Tile 기준, 6 * 8 = 48 간격으로 배치되어야 함
            // 1 * 48 = 48
            // 2 * 48 = 96
            // TODO: 여기에 RPG Maker 호환 코드를 추가해야 함
            items = data;
            return items;
        }
    }
    InitialEditor.TilemapTransformer = TilemapTransformer;
})(InitialEditor || (InitialEditor = {}));
//# sourceMappingURL=TilemapTransformer.js.map