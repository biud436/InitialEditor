import {EventEmitter} from "./EventEmitter";

class Component extends EventEmitter {

    protected _isActiveEvent: boolean;

    constructor(...args: any[]) {
        super();
        this.initMembers(...args);
        this.start(...args);
    }

    initMembers(...args: any[]) {
        this._isActiveEvent = false;
    }

    active() {
        this._isActiveEvent = true;
    }
    
    deactive() {
        this._isActiveEvent = false;
    }

    isActiveEvent() {
        return this._isActiveEvent;
    }

    start(...args:any[]): Component {
        return this;
    }

    update(...args: any[]) {

    }
}

class BasicComponent extends Component {
    constructor(...args: any[]) {
        super(...args);
    }
}

export { Component, BasicComponent };