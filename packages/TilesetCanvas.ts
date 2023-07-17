import "reflect-metadata";
import { Service } from "typedi";
import { config } from "./config.js";

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
        this._tilesets = [];

        let count = 0;

        return new Promise((resolve, reject) => {
            for (let i = 0; i < this._tilesetImgages.length; i++) {
                const elem = document.createElement("img");
                elem.src = this._tilesetImgages[i];
                elem.onload = () => {
                    this._tilesets.push(elem);

                    ++count;

                    if (count >= this._tilesetImgages.length) {
                        console.log(this._tilesetImgages[i]);
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
        const canvasWidth = this._config.TILE_WIDTH * this._config.MAP_COLS;
        const canvasHeight =
            this._config.TILE_HEIGHT * this._config.MAP_ROWS * 4;

        this._parent = document.querySelector("#view")!;
        this._canvas = document.createElement("canvas");
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

        let maxW = 0;
        let maxH = 0;

        for (let i = 0; i < this._tilesetImgages.length; i++) {
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
