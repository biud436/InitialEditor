import * as fs from "fs";

class Schema {
    constructor(config: any) {   
        this.initMembers(config);
    }

    initMembers(config: any) {
    }

    toJson() {
        return JSON.stringify(this);
    }

    toFile(filename?: string): Promise<void> {

        if(!filename) {
            filename = this.constructor.name;
        }

        const contents = this.toJson();

        return new Promise((resolve, reject) => {
            fs.writeFile(filename, contents, {encoding: "utf8"}, (err) => {
                if(err) {
                    reject(err.message);
                }
                resolve();
            });
        });
    }

}

export {Schema};