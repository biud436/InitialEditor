import {config} from "./config.js";

export default class TilesetCanvas {
    constructor(...args) {
        this.initMembers(...args)
    }

    initMembers(...args) {
        this._config = args[0];
        this._isReady = false;
        this._tilesetImgages = this._config.TILESET_IMGAGES;
    }

    async start() {
        return this.loadTilesets();
    }

    async loadTilesets() {
        this._tilesets = [];

        let count = 0;

        return new Promise((resolve, reject) => {
            for(let i = 0; i < this._tilesetImgages.length; i++) {
                const elem = $("<img>").attr("src", this._tilesetImgages[i]);
                elem.hide();
                elem.appendTo($("#view"));
    
                elem.on("load", () => {     
                    count++;
                    this._tilesets.push(elem);
                    if(count >= this._tilesetImgages.length) {
                        this.createCanvas();
                        resolve();
                    }
                });
                elem.on("error", reject);
            }
        });       
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
            })

        this._parent.prepend(this._canvas)
        this._parent.css({
            "width": "100%",
            "height": "60%",
        });

        /**
         * @type {CanvasRenderingContext2D}
         */
        this._context = this._canvas.get(0).getContext("2d");
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
            
            if(width > maxW) {
                maxW = width;
                this._canvas.prop("width" , maxW);                
            }
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
