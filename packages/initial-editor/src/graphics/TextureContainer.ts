import * as PIXI from "pixi.js";

export class TextureContainer {
    private _texture: PIXI.Texture;

    constructor(texture: PIXI.Texture) {
        this._texture = texture;
    }

    get texture(): PIXI.Texture {
        return this._texture;
    }

    set texture(value: PIXI.Texture) {
        this._texture = value;
    }
}
