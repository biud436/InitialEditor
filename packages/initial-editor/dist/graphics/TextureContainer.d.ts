import * as PIXI from "pixi.js";
export declare class TextureContainer {
    private _texture;
    constructor(texture: PIXI.Texture);
    get texture(): PIXI.Texture;
    set texture(value: PIXI.Texture);
    static fromImage(imageUrl: string, options: PIXI.IBaseTextureOptions): TextureContainer;
}
