class EventEmitter {

    protected _events: {[eventName: string]: Array<Function>};

    constructor() {
        this._events = {};
    }

    on(name: string, lsn: Function):EventEmitter {
        if(!this._events[name]) {
            this._events[name] = [];
        }

        this._events[name].push(lsn);

        return this;
    }

    emit(name: string, ...args: any[]) {
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