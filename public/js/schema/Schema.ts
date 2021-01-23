import * as fs from "fs";

class Schema {
    constructor(config: any) {   
        this.initMembers(config);
    }

    initMembers(config: any) {
        
    }

    /**
     * 멤버 변수를 JSON 데이터로 변환합니다.
     */
    toJson() {
        return JSON.stringify(this, null, "    ");
    }

    getPathResolve(file: string) {
        // .을 이용한 상대 경로인가?
        if(file.startsWith(".")) {
            return file.slice(1);
        }
        return file;
    }

    loadJson(filename?: string) {
        return new Promise((resolve, reject) => {
            const xhr = new XMLHttpRequest();
            xhr.open("GET", this.getPathResolve(filename));
            xhr.onload = function() {
                if(xhr.status === 200) {
                    const json = JSON.parse(xhr.responseType);
                    resolve(json);
                } else {
                    reject("The http status code is not 200. Please check it");
                }
            };
            xhr.onerror = function(err) {
                reject(err);
            }
            xhr.send();
        });
    }

    loadFile(filename?: string) {
        return new Promise((resolve, reject) => {
            fs.readFile(filename, "utf-8", (err, data) => {
                if(err) {
                    reject(err);
                    return;
                }
                resolve(data);
            });
        });
    }

    load(filename? :string) {
        if(!filename) {
            filename = this.constructor.name;
        }
        
        return this.loadJson(filename);
    }

    /**
     * 파일로 내보냅니다 (비동기 방식)
     * 
     * @param filename 
     */
    toFile(filename?: string): Promise<void> {

        const path = require('path');

        if(!filename) {
            filename = this.constructor.name;
        }

        const contents = this.toJson();

        return new Promise((resolve, reject) => {
            // 파일 저장 기능은 일렉트론에서만 지원합니다.
            // 브라우저 버전에선 DB에 저장해야 합니다.
            // DB 연동은 활용 가능한 ORM이 없어서 수작업을 해야하므로 당분간 보류.
            resolve();

            // fs.writeFile(filename, contents, {encoding: "utf8"}, (err) => {
            //     if(err) {
            //         reject(err.message);
            //     }
            //     resolve();
            // });
        });
    }

}

export {Schema};