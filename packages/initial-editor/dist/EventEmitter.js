import { NotFoundEvent } from "./errors/NotFoundEvent";
class EventEmitter {
    constructor() {
        this._events = {};
    }
    debug(message) {
        if (window.devmode) {
            console.log(message);
        }
    }
    on(name, lsn) {
        this.initIfNotEvent(name);
        this._events[name].push(lsn);
        return this;
    }
    /**
     * 이벤트를 삭제합니다.
     *
     * @param {String} name
     */
    off(name) {
        if (this.isInvalidEvent(name)) {
            return;
        }
        if (name in this._events) {
            delete this._events[name];
        }
    }
    emit(name, ...args) {
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
    isInvalidEvent(name) {
        return !this._events[name];
    }
    initIfNotEvent(name) {
        if (this.isInvalidEvent(name)) {
            this._events[name] = [];
        }
    }
    getSubEventItems(name) {
        return name.split(":");
    }
    isIncludeSubEvent(name) {
        return name.indexOf(":") >= 0;
    }
}
export { EventEmitter };
//# sourceMappingURL=EventEmitter.js.map