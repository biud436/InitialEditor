import "reflect-metadata";
import { Service } from "typedi";
import { config } from "./config.js";
import InitialDOM from "./utils/InitialDOM";

@Service()
export default class TilesetCanvas {
    private _config: any;
    private _isReady!: boolean;
    private _tilesetImgages!: string[];
    private _tilesets!: Array<any>;
    private _parent!: HTMLDivElement;
    private _canvas!: HTMLCanvasElement;
    private _context!: CanvasRenderingContext2D;

    constructor(...args: any[]) {
        this.initMembers(...args);
    }

    public initMembers(...args: any[]) {
        this._config = args[0];
        this._isReady = false;
        this._tilesetImgages = this._config.TILESET_IMGAGES;
    }

    public async start(...args: any[]) {
        return this.loadTilesets();
    }

    public async loadTilesets() {
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
                        this.createCanvas();
                        resolve(this._tilesetImgages[i]);
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
    public async refreshTilesets(newTileset: string) {
        this._tilesetImgages.push(newTileset);

        if (this._canvas) {
            this._canvas.remove();
        }

        await this.start().then((ret) => {
            window.app.createComponents();
        });
    }

    public createCanvas() {
        const { TILE_WIDTH, MAP_COLS, TILE_HEIGHT, MAP_ROWS } = this._config;

        const canvasWidth = TILE_WIDTH * MAP_COLS;
        const canvasHeight = TILE_HEIGHT * MAP_ROWS * 4;

        this._parent = InitialDOM.query("#view")!;
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
        this._context = this._canvas.getContext("2d")!;
        const ctx = this._context;

        let acc = 0;
        let maxH = 0;

        const lenOfTileset = this._tilesetImgages.length;

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
            ctx.drawImage(img, 0, 0, width, height);
            acc += height;
        }

        this._isReady = true;
    }
}
