import {config} from "./config.js";
import * as $globals from './globals';

export default class TilesetCanvas {

    private _config: any;
    private _isReady: boolean;
    private _tilesetImgages: string[];
    private _tilesets: Array<any>;
    private _parent: JQuery<HTMLDivElement>;
    private _canvas: JQuery<HTMLElement>;
    private _context: CanvasRenderingContext2D;

    constructor(...args: any[]) {
        this.initMembers(...args)
    }

    initMembers(...args: any[]) {
        this._config = args[0];
        this._isReady = false;
        this._tilesetImgages = this._config.TILESET_IMGAGES;
    }

    async start(...args: any[]) {
        return this.loadTilesets();
    }

    async loadTilesets() {
        this._tilesets = [];

        let count = 0;

        return new Promise((resolve, reject) => {
            for(let i = 0; i < this._tilesetImgages.length; i++) {
                const elem = $("<img>").attr("src", this._tilesetImgages[i]);   
                elem.on("load", () => {     
                    this._tilesets.push(elem);
                    
                    ++count;

                    if(count >= this._tilesetImgages.length) {
                        console.log(this._tilesetImgages[i]);
                        this.createCanvas();
                        resolve();
                    }
                });
                elem.on("error", reject);
            }
        });       
    }

    /**
     * 이 메소드는 타일셋을 지우고 다시 처음부터 그립니다.
     * 새로운 이미지가 있으면 맨 아래에 추가됩니다.
     */
    async refreshTilesets(newTileset: string) {
        
        this._tilesetImgages.push(newTileset);

        if(this._canvas) {
            this._canvas.remove();
        }

        await this.start().then(ret => {
            $globals.app.createComponents();
        })
    }

    createCanvas() {

        const canvasWidth = this._config.TILE_WIDTH * this._config.MAP_COLS;
        const canvasHeight = this._config.TILE_HEIGHT * this._config.MAP_ROWS * 4;

        this._parent = $("#view");
        this._canvas = $("<canvas />", {"id": "tileset-canvas"})
            .attr("width", canvasWidth)
            .attr("height", canvasHeight)
            .css({
                "padding": "0",
                "margin": "0"
            });

        this._parent.prepend(this._canvas)
        this._parent.css({
            "width": "100%",
            "height": "60%",
        });

        /**
         * @type {CanvasRenderingContext2D}
         */
        this._context = (this._canvas.get(0) as HTMLCanvasElement).getContext("2d");
        const ctx = this._context;

        let acc = 0;

        let maxW = 0;
        let maxH = 0;
        
        for(let i = 0; i < this._tilesetImgages.length; i++) {

            /**
             * @type {JQuery}
             */
            const img = this._tilesets[i];
            const width = img.get(0).naturalWidth;
            const height = img.get(0).naturalHeight;   
            
            if(height > acc + height) {
                maxH = acc + height;
                this._canvas.prop("height" , maxH);                
            }

            ctx.setTransform(1, 0, 0, 1, 0, acc);
            ctx.imageSmoothingEnabled = false;
            ctx.drawImage(img.get(0), 0, 0, width, height);
            acc += height;            
        }

        this._isReady = true;
    }

    
}
