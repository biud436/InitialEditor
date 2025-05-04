export class NotFoundEvent extends Error {
    constructor(name) {
        super(`There is no ${name}. Please check the event name.`);
    }
}
//# sourceMappingURL=NotFoundEvent.js.map