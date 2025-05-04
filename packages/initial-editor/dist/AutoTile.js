var __decorate = (this && this.__decorate) || function (decorators, target, key, desc) {
    var c = arguments.length, r = c < 3 ? target : desc === null ? desc = Object.getOwnPropertyDescriptor(target, key) : desc, d;
    if (typeof Reflect === "object" && typeof Reflect.decorate === "function") r = Reflect.decorate(decorators, target, key, desc);
    else for (var i = decorators.length - 1; i >= 0; i--) if (d = decorators[i]) r = (c < 3 ? d(r) : c > 3 ? d(target, key, r) : d(target, key)) || r;
    return c > 3 && r && Object.defineProperty(target, key, r), r;
};
var __metadata = (this && this.__metadata) || function (k, v) {
    if (typeof Reflect === "object" && typeof Reflect.metadata === "function") return Reflect.metadata(k, v);
};
var AutoTile_1;
import { EventEmitter } from "./EventEmitter";
import { config } from "./config";
import { Service } from "typedi";
/**
 * @class AutoTile
 * @see
 * <a href="http://www.cr31.co.uk/stagecast/wang/blob.html">reference</a>
 */
let AutoTile = AutoTile_1 = class AutoTile extends EventEmitter {
    constructor(filename) {
        super();
        this._normalTile = this.findNormalTile();
        this._filename = filename;
    }
    findNormalTile() {
        const data = AutoTile_1.TABLE;
        let target = 0;
        let found = {
            x: 0,
            y: 0,
        };
        // 일반 타일을 찾습니다.
        for (let y = 0; y < AutoTile_1.ROWS; y++) {
            for (let x = 0; x < AutoTile_1.COLS; x++) {
                if (data[y * AutoTile_1.ROWS + x] == target) {
                    found = { x, y };
                }
            }
        }
        Object.assign(found, {
            width: config.TILE_WIDTH,
            height: config.TILE_HEIGHT,
        });
        return found;
    }
    /**
     * 이미지가 오토타일인 지 감별합니다.
     *
     * @param filename
     * @return Promise<PIXI.Sprite>
     */
    checkToValidAutoTile(filename) {
        const tw = config.TILE_WIDTH;
        const th = config.TILE_HEIGHT;
        return new Promise((resolve, reject) => {
            // const loader = new PIXI.Loader();
            // loader
            //     .add("autotile", filename)
            //     .load((loader, res) => {
            //         const sprite = PIXI.Sprite.from(res.autotile!.texture);
            //         const width = sprite.texture.width;
            //         const height = sprite.texture.height;
            //         if (width > height) {
            //             let type = [];
            //             type.push(width % tw === 0);
            //             type.push(height % th === 0);
            //             const toArray = type.filter((i) => !!i);
            //             if (toArray.length === 0) {
            //                 reject(
            //                     "오토 타일이 잘못되었습니다. 사이즈를 제대로 확인하십시오."
            //                 );
            //             }
            //             resolve(sprite);
            //         } else if (width < height) {
            //             reject("6 x 8 레이아웃이 아닙니다.");
            //         } else {
            //             reject("정방형 오토타일은 사용할 수 없습니다.");
            //         }
            //     });
        });
    }
};
/**
 * Wang Blob 6 x 8 Layout (RM-Custom)
 */
// prettier-ignore
AutoTile.TABLE = [
    255, 127, 253, 125, 247, 119, 245, 117,
    223, 95, 221, 93, 215, 87, 213, 85,
    31, 29, 23, 21, 124, 116, 92, 84,
    241, 209, 113, 81, 199, 71, 197, 69,
    17, 68, 28, 20, 112, 80, 193, 65,
    7, 5, 16, 4, 1, 64, 0, 0
];
// Wang Blob 6 x 8 (Default)
// prettier-ignore
AutoTile.TABLE2 = [
    20, 68, 92, 112, 28, 124, 116, 80,
    21, 84, 87, 221, 127, 255, 241, 17,
    29, 117, 85, 95, 247, 215, 209, 1,
    23, 213, 81, 31, 253, 125, 113, 16,
    5, 69, 93, 119, 223, 255, 245, 65,
    0, 4, 71, 193, 7, 199, 197, 64
];
AutoTile.COLS = 8;
AutoTile.ROWS = 6;
AutoTile = AutoTile_1 = __decorate([
    Service(),
    __metadata("design:paramtypes", [String])
], AutoTile);
export { AutoTile };
//# sourceMappingURL=AutoTile.js.map