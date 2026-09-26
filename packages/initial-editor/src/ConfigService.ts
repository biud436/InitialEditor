import { EventEmitter } from "./EventEmitter";
import { MyEditorConfig, config } from "./config";
import { InvalidTilesetImage } from "./errors/InvalidTilesetImage";
import { NotFoundImage } from "./errors/NotFoundImage";
import { FileProvider } from "./schema";

export class ConfigService extends EventEmitter {
    private config: MyEditorConfig;
    private readonly fileProvider: FileProvider = new FileProvider();

    constructor() {
        super();
        this.config = JSON.parse(JSON.stringify(config));
    }

    public addTilesetImages(images: string[]) {
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

    private isValidImagePath(image: string): unknown {
        return (
            this.config.TILESET_IMGAGES.indexOf(image) === -1 &&
            image.length > 0
        );
    }
}
