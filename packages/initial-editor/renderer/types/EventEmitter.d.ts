/**
 * @class EventEmitter
 * @description
 * 이 클래스는 이벤트 큐를 위해 존재합니다.
 * on 과 emit로 이벤트를 설정하거나 실행할 수 있습니다.
 */
declare class EventEmitter {
    protected _events: {
        [eventName: string]: Array<Function>;
    };
    constructor();
    debug(message: string): void;
    on(name: string, lsn: Function): EventEmitter;
    /**
     * 이벤트를 삭제합니다.
     *
     * @param {String} name
     */
    off(name: string): void;
    emit(name: string, ...args: any[]): void;
}
export { EventEmitter };
