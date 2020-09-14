import {
    Component
} from "./component.js";

export default class Tilemap extends Component {

    initMembers() {}

    start() {
        this._app = new PIXI.Application({
            width: 800,
            height: 600,
            backgroundColor: 0x000000,
            resolution: window.devicePixelRatio || 1,
            view: document.querySelector("#main-canvas")
        });
        this.draw();
    }

    get app() {
        return this._app;
    }

    draw() {
        const container = new PIXI.Container();
        
        this.app.stage.addChild(container);

        const texture = PIXI.Texture.from('images/tiles/tileset16-8x13.png');
        const { frame } = texture;
        const tileID = 45;
        const dx = (tileID % 8) * 16;
        const dy = (tileID / 8) * 16;
        const crop = new PIXI.Rectangle(dx, dy, 16, 16);
        const cropTexture = new PIXI.Texture(texture.baseTexture, crop);

        const mapWidth = Math.round(800 / 16);
        const mapHeight = Math.round(600 / 16);

        for(let y = 0; y < mapHeight; y++) {
            for(let x = 0; x < mapWidth; x++) {
                const sprite = new PIXI.Sprite(cropTexture);
                sprite.x = x * 16;
                sprite.y = y * 16;
                container.addChild(sprite);
            }
        }
    }

}