
export default class TilesetCanvas {
    constructor() {
        this.initMembers()
    }

    initMembers() {
        this._isReady = false;
    }

    async start() {
        return this.loadTilesets();
    }

    async loadTilesets() {
        this._tilesets = [];

        return new Promise((resolve, reject) => {
            for(let i = 0; i < 1; i++) {
                const elem = $("<img>").attr("src", "./images/tiles/tileset16-8x13.png");
                elem.hide();
                elem.appendTo($("#view"));
    
                elem.on("load", () => {     
                    this._tilesets.push(elem);
                    this.createCanvas();
                    resolve();
                });
                elem.on("error", reject);
            }
        });       
    }

    createCanvas() {
        this._parent = $("#view");
        this._canvas = $("<canvas />", {"id": "tileset-canvas"});

        this._parent.prepend(this._canvas)
        this._parent.css({
            "width": "100%",
            "height": "60%",
        })

        /**
         * @type {CanvasRenderingContext2D}
         */
        this._context = this._canvas.get(0).getContext("2d");
        const ctx = this._context;
        
        for(let i = 0; i < 1; i++) {

            /**
             * @type {JQuery}
             */
            const img = this._tilesets[0];
            const width = img.get(0).naturalWidth;
            const height = img.get(0).naturalHeight;               

            this._canvas.get(0).width = width;
            this._canvas.get(0).height = height;


            ctx.save();
               
            ctx.setTransform(1, 0, 0, 1, 0, 0);
            ctx.imageSmoothingEnabled = false;
            ctx.drawImage(img.get(0), 0, 0, width, height);
        }

        ctx.restore();
        
        this._isReady = true;
    }

    
}
