import * as PIXI from "pixi.js";
export class TextureContainer {
    constructor(texture) {
        this._texture = texture;
    }
    get texture() {
        return this._texture;
    }
    set texture(value) {
        this._texture = value;
    }
    static fromImage(imageUrl, options) {
        const texture = PIXI.Texture.from(imageUrl, options);
        return new TextureContainer(texture);
    }
}
//# sourceMappingURL=TextureContainer.js.map