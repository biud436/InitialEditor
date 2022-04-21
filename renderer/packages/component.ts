import { EventEmitter } from "./EventEmitter";

class Component extends EventEmitter {
    protected _isActiveEvent: boolean;

    constructor(...args: any[]) {
        super();
        this.initMembers(...args);
        this.start(...args);
    }

    public initMembers(...args: any[]) {
        this._isActiveEvent = false;
    }

    public active() {
        this._isActiveEvent = true;
    }

    public deactive() {
        this._isActiveEvent = false;
    }

    public isActiveEvent() {
        return this._isActiveEvent;
    }

    public start(...args: any[]): Component {
        return this;
    }

    public update(...args: any[]) {}
}

class BasicComponent extends Component {
    constructor(...args: any[]) {
        super(...args);
    }
}

export { Component, BasicComponent };
