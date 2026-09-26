export class NotFoundEvent extends Error {
    constructor(name: string) {
        super(`There is no ${name}. Please check the event name.`);
    }
}
