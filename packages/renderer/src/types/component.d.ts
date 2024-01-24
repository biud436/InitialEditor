import { EventEmitter } from "./EventEmitter";
declare class Component extends EventEmitter {
    protected _isActiveEvent: boolean;
    constructor(...args: unknown[]);
    initMembers(...args: unknown[]): void;
    active(): void;
    deactive(): void;
    isActiveEvent(): boolean;
    start(...args: unknown[]): Component;
    update(...args: unknown[]): void;
}
declare class BasicComponent extends Component {
    constructor(...args: any[]);
}
export { Component, BasicComponent };
