var __decorate = (this && this.__decorate) || function (decorators, target, key, desc) {
    var c = arguments.length, r = c < 3 ? target : desc === null ? desc = Object.getOwnPropertyDescriptor(target, key) : desc, d;
    if (typeof Reflect === "object" && typeof Reflect.decorate === "function") r = Reflect.decorate(decorators, target, key, desc);
    else for (var i = decorators.length - 1; i >= 0; i--) if (d = decorators[i]) r = (c < 3 ? d(r) : c > 3 ? d(target, key, r) : d(target, key)) || r;
    return c > 3 && r && Object.defineProperty(target, key, r), r;
};
var __metadata = (this && this.__metadata) || function (k, v) {
    if (typeof Reflect === "object" && typeof Reflect.metadata === "function") return Reflect.metadata(k, v);
};
import "reflect-metadata";
import { Service } from "typedi";
import InitialDOM from "./utils/InitialDOM";
import App from "./app";
let TilesetCanvas = class TilesetCanvas {
    constructor(...args) {
        this.initMembers(...args);
    }
    initMembers(...args) {
        this._config = args[0];
        this._isReady = false;
        this._tilesetImgages = this._config.TILESET_IMGAGES;
    }
    async start(...args) {
        return this.loadTilesets();
    }
    async loadTilesets() {
        const lenOfTileset = this._tilesetImgages.length;
        this._tilesets = [];
        let count = 0;
        return new Promise((resolve, reject) => {
            for (let i = 0; i < lenOfTileset; i++) {
                const elem = InitialDOM.fetch("img");
                elem.src = this._tilesetImgages[i];
                elem.onload = () => {
                    this._tilesets.push(elem);
                    ++count;
                    if (count >= lenOfTileset) {
                        this.createCanvas()
                            .then(() => {
                            resolve(this._tilesetImgages[i]);
                        })
                            .catch((err) => {
                            reject(err);
                        });
                    }
                };
                elem.onerror = reject;
            }
        });
    }
    /**
     * 이 메소드는 타일셋을 지우고 다시 처음부터 그립니다.
     * 새로운 이미지가 있으면 맨 아래에 추가됩니다.
     */
    async refreshTilesets(newTileset) {
        this._tilesetImgages.push(newTileset);
        if (this._canvas) {
            this._canvas.remove();
        }
        await this.start().then((ret) => {
            App.GetInstance().createComponents();
        });
    }
    /**
     * HEX 컬러를 웹 색상으로 변환합니다.
     * @param hex
     * @returns
     */
    hexToRgb(hex) {
        if (hex.startsWith("#")) {
            hex = hex.slice(1);
        }
        const bigint = parseInt(hex, 16);
        const r = (bigint >> 16) & 255;
        const g = (bigint >> 8) & 255;
        const b = bigint & 255;
        return [r, g, b];
    }
    /**
     * 특정 색을 투명하게 만듭니다.
     * 일부 타일셋의 경우, 알파 채널이 없는 경우가 있습니다.
     * 이 경우, 투명도를 적용할 수 없기 때문에 이미지 프로세싱이 필요합니다.
     *
     * 픽셀 셰이터를 통해 투명화하면 하드웨어 가속이 가능하지만,
     * 타일셋 뷰가 캔버스로 구현되어있기 때문에 소프트웨어 렌더링으로 처리됩니다.
     *
     * @param imageData
     * @param width
     * @param height
     * @param targetColor
     * @param isAlpha
     * @returns
     */
    convertWithUInt8Array(imageData, width, height, targetColor = "#ffffff", isAlpha = true) {
        // 색상을 RGB로 변환합니다.
        const targetTransparentColor = this.hexToRgb(targetColor);
        const { data } = imageData;
        const view = new Uint8Array(imageData.data.buffer);
        for (let i = 0; i < data.length; ++i) {
            view[i] = data[i];
        }
        // Blob 생성
        const blob = new Blob([view], { type: "image/png" });
        // 캔버스 생성
        const canvas = document.createElement("canvas");
        canvas.width = width;
        canvas.height = height;
        const ctx = canvas.getContext("2d");
        if (!ctx) {
            return;
        }
        const rawData = imageData.data;
        const [r, g, b] = targetTransparentColor;
        // 이미지 데이터는 보통 4바이트 정수형 배열로 저장됩니다.
        // 따라서 4바이트씩 읽어서 투명도를 적용합니다.
        if (isAlpha) {
            for (let i = 0; i < data.length; i += 4) {
                if (rawData[i] === r &&
                    rawData[i + 1] === g &&
                    rawData[i + 2] === b) {
                    rawData[i + 3] = 0;
                }
            }
        }
        return imageData;
    }
    /**
     * 이미지 데이터를 획득합니다.
     * @param img
     * @returns
     */
    getImageData(img) {
        const canvas = document.createElement("canvas");
        const ctx = canvas.getContext("2d");
        if (!ctx) {
            return;
        }
        canvas.width = img.width;
        canvas.height = img.height;
        ctx.drawImage(img, 0, 0);
        const imageData = ctx.getImageData(0, 0, img.width, img.height);
        return imageData;
    }
    async createCanvas() {
        const { TILE_WIDTH, MAP_COLS, TILE_HEIGHT, MAP_ROWS } = this._config;
        const canvasWidth = TILE_WIDTH * MAP_COLS;
        const canvasHeight = TILE_HEIGHT * MAP_ROWS * 4;
        this._parent = InitialDOM.query("#view");
        this._canvas = InitialDOM.fetch("canvas");
        this._canvas.id = "tileset-canvas";
        this._canvas.width = canvasWidth;
        this._canvas.height = canvasHeight;
        this._canvas.style.padding = "0";
        this._canvas.style.margin = "0";
        this._parent.appendChild(this._canvas);
        /**
         * @type {CanvasRenderingContext2D}
         */
        this._context = this._canvas.getContext("2d");
        const ctx = this._context;
        let acc = 0;
        let maxH = 0;
        // 이미지 투명도 적용 후, 텍스쳐로 변환합니다.
        const processing = [];
        for (let i = 0; i < this._tilesets.length; i++) {
            const tileset = this._tilesets[i];
            const imageData = this.getImageData(tileset);
            if (!imageData) {
                continue;
            }
            const texture = await this.convertWithUInt8Array(imageData, tileset.width, tileset.height, "#007575", true);
            if (!texture) {
                console.warn("투명도 텍스쳐가 정상적으로 생성되지 않았습니다.");
                continue;
            }
            processing.push(texture);
        }
        // 이미지를 그립니다.
        const lenOfTileset = this._tilesets.length;
        for (let i = 0; i < lenOfTileset; i++) {
            const img = this._tilesets[i];
            const width = img.naturalWidth;
            const height = img.naturalHeight;
            if (height > acc + height) {
                maxH = acc + height;
                this._canvas.height = maxH;
            }
            ctx.setTransform(1, 0, 0, 1, 0, acc);
            ctx.imageSmoothingEnabled = false;
            ctx.putImageData(processing[i], 0, acc);
            acc += height;
        }
        this._isReady = true;
    }
};
TilesetCanvas = __decorate([
    Service(),
    __metadata("design:paramtypes", [Object])
], TilesetCanvas);
export default TilesetCanvas;
//# sourceMappingURL=TilesetCanvas.js.map