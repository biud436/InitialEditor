declare class EventEmitter {
    private _events;
    constructor();
    on(name: string, lsn: Function): EventEmitter;
    emit(name: string, ...args: any[]): void;
}
export { EventEmitter };
