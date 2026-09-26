import { EventEmitter } from "./EventEmitter";
import { config } from "./config";
import { InvalidTilesetImage } from "./errors/InvalidTilesetImage";
import { NotFoundImage } from "./errors/NotFoundImage";
import { FileProvider } from "./schema";
export class ConfigService extends EventEmitter {
    constructor() {
        super();
        this.fileProvider = new FileProvider();
        this.config = JSON.parse(JSON.stringify(config));
    }
    addTilesetImages(images) {
        if (!images || !Array.isArray(images)) {
            throw new NotFoundImage();
        }
        const isValid = images.every((image) => this.isValidImagePath(image));
        if (!isValid) {
            throw new InvalidTilesetImage();
        }
        this.config.TILESET_IMGAGES =
            this.config.TILESET_IMGAGES.concat(images);
        this.emit("change", this.config);
    }
    isValidImagePath(image) {
        return (this.config.TILESET_IMGAGES.indexOf(image) === -1 &&
            image.length > 0);
    }
}
//# sourceMappingURL=ConfigService.js.map