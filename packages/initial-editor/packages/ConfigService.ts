import { EventEmitter } from "./EventEmitter";
import { MyEditorConfig, config } from "./config";
import * as fs from "fs";

export class ConfigService extends EventEmitter {
    private config: MyEditorConfig;
    constructor() {
        super();
        this.config = JSON.parse(JSON.stringify(config));
    }

    public addTilesetImages(images: string[]) {
        const isValid = images.every((image) => {
            return (
                this.config.TILESET_IMGAGES.indexOf(image) === -1 &&
                image.length > 0 &&
                fs.existsSync(image)
            );
        });

        if (!isValid) {
            throw new Error("can't add tileset images");
        }

        this.config.TILESET_IMGAGES =
            this.config.TILESET_IMGAGES.concat(images);

        this.emit("change", this.config);
    }
}
