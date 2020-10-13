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

        // Is it included colon(:)?
        if(name.indexOf(":") >= 0) {
            console.log("자식 이벤트 방출이 감지되었습니다.");
            const items = name.split(":");
            if(items.length > 0) {
                const parent = name[0];
                const child = name[1];
                
                // 콜론이 있다면 매개변수를 대체합니다.
                name = parent;
                args = [child, ...args];
            }
        }

        this._events[name].forEach(func => {
            if(typeof(func) === "function") {
                func(...args);
            }
        });
    }
}

export {EventEmitter};