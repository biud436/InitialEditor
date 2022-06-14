import { EventEmitter } from "./EventEmitter";
declare class Component extends EventEmitter {
    protected _isActiveEvent: boolean;
    constructor(...args: any[]);
    initMembers(...args: any[]): void;
    active(): void;
    deactive(): void;
    isActiveEvent(): boolean;
    start(...args: any[]): Component;
    update(...args: any[]): void;
}
declare class BasicComponent extends Component {
    constructor(...args: any[]);
}
export { Component, BasicComponent };
