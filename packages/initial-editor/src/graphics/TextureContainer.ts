import * as PIXI from "pixi.js";

export class TextureContainer {
    private _texture: PIXI.Texture;

    constructor(texture: PIXI.Texture) {
        this._texture = texture;
    }
}
