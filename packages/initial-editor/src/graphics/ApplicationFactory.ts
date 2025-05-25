import * as PIXI from "pixi.js";

export class ApplicationFactory {
    static create(
        options: Partial<PIXI.IApplicationOptions>,
    ): PIXI.Application {
        return new PIXI.Application(options);
    }
}
