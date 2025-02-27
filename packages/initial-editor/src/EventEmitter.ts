import { NotFoundEvent } from "./errors/NotFoundEvent";

/**
 * @class EventEmitter
 * @description
 * 이 클래스는 이벤트 큐를 위해 존재합니다.
 * on 과 emit로 이벤트를 설정하거나 실행할 수 있습니다.
 */
export type EventLambda = (...args: any[]) => void;
export type EventList = { [eventName: string]: Array<EventLambda> };

class EventEmitter {
    protected _events: EventList;

    constructor() {
        this._events = {};
    }

    public debug(message: string) {
        if (window.devmode) {
            console.log(message);
        }
    }

    public on(name: string, lsn: EventLambda): EventEmitter {
        this.initIfNotEvent(name);

        this._events[name].push(lsn);

        return this;
    }

    /**
     * 이벤트를 삭제합니다.
     *
     * @param {String} name
     */
    public off(name: string): void {
        if (this.isInvalidEvent(name)) {
            return;
        }

        if (name in this._events) {
            delete this._events[name];
        }
    }

    public emit(name: string, ...args: any[]): void {
        this.initIfNotEvent(name);

        // Is it included colon(:)?
        if (this.isIncludeSubEvent(name)) {
            const items = this.getSubEventItems(name);
            if (items.length > 0) {
                const parent = items[0];
                const child = items[1];

                // 콜론이 있다면 매개변수를 대체합니다.
                name = parent;
                args = [child, ...args];
            }
        }

        if (!this._events[name]) {
            throw new NotFoundEvent(name);
        }

        this._events[name].forEach((func) => {
            if (typeof func === "function") {
                func(...args);
            }
        });
    }

    private isInvalidEvent(name: string) {
        return !this._events[name];
    }

    private initIfNotEvent(name: string) {
        if (this.isInvalidEvent(name)) {
            this._events[name] = [];
        }
    }

    private getSubEventItems(name: string) {
        return name.split(":");
    }

    private isIncludeSubEvent(name: string) {
        return name.indexOf(":") >= 0;
    }
}

export { EventEmitter };
