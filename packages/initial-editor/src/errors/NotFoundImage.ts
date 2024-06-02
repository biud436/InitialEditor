export class NotFoundImage extends Error {
    constructor() {
        super("Not found image. Please check the image path.");
    }
}
