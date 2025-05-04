import "reflect-metadata";
import App from "./app";
export declare class Main {
    static app: App;
    static start(bindFunc: Function): void;
    static update(deltaTime: number): void;
}
