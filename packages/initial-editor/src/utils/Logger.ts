import "reflect-metadata";
import { Service } from "typedi";

@Service()
export class Logger {
    public log(...args: string[]) {
        console.log(...args);
    }
}
