/**
 * @class EventEmitter
 * @description
 * 이 클래스는 이벤트 큐를 위해 존재합니다.
 * on 과 emit로 이벤트를 설정하거나 실행할 수 있습니다.
 */
class EventEmitter {

    protected _events: {[eventName: string]: Array<Function>};

    constructor() {
        this._events = {};
    }

    debug(message: string) {
        if(window.devmode) {
            console.log(message);
        }
    }

    on(name: string, lsn: Function):EventEmitter {

        if(!this._events[name]) {
            this._events[name] = [];
        }

        this._events[name].push(lsn);

        return this;
    }

    /**
     * 이벤트를 삭제합니다.
     * 
     * @param {String} name 
     */
    off(name: string) {
        if(!this._events[name]) {
            return;
        }

        if(name in this._events) {
            delete this._events[name];
        }
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
                const parent = items[0];
                const child = items[1];
                
                // 콜론이 있다면 매개변수를 대체합니다.
                name = parent;
                args = [child, ...args];

                console.log(name, args);
            }
        }

        if(!this._events[name]) {
            throw new Error(`${name}이 없습니다.`);
        }

        this._events[name].forEach(func => {
            if(typeof(func) === "function") {
                func(...args);
            }
        });
    }
}

export {EventEmitter};