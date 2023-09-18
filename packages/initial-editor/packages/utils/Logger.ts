import "reflect-metadata";
import { Service } from "typedi";
import chalk from "chalk";

@Service()
export class Logger {
    public log(...args: string[]) {
        console.log(chalk.greenBright(...args));
    }
}
