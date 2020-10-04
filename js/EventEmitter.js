class EventEmitter {
    constructor() {
        this._events = {};
    }

    on(name, lsn) {
        if(!this._events[name]) {
            this._events[name] = [];
        }

        this._events[name].push(lsn);

        return this;
    }

    emit(name, ...args) {
        if(!this._events[name]) {
            this._events[name] = [];
        }

        this._events[name].forEach(func => {
            if(typeof(func) === "function") {
                func(...args);
            }
        });
    }
}

export {EventEmitter};