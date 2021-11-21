import * as chalk from "chalk";
import * as inquirer from "inquirer";
import { Command } from "commander";

/**
 * @description
 * This script file allows you to run as below command using terminal.
 *
 * try to do :
 *  npm run cli -- --help
 */
namespace EntryPoint {
    export class Logger {
        public static log(message: string): void {
            console.log(`${chalk.yellow("[LOG]")}${message}${chalk.reset()}`);
        }
    }

    export class CliService {
        private _program: Command;
        public static INSTANCE: CliService = new CliService();

        constructor() {
            this._program = new Command();
            this._program.version("0.0.3");
        }

        public async run(args: string[]): Promise<void> {
            // parse command line arguments
            this._program.parse(args);

            // print help documenation.
            this._program.on("--help", () => {
                this.printHelp();
            });
        }

        private printHelp(): void {
            Logger.log(`도움말입니다.`);
        }

        public static getInstance(): CliService {
            return CliService.INSTANCE;
        }
    }
}

EntryPoint.CliService.getInstance().run(process.argv);
