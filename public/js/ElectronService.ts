import {EventEmitter} from "./EventEmitter";
/**
 * @class ElectronService
 * @description
 * 일렉트론과 IPC를 하기 위해 만든 클래스입니다.
 * 
 * 다양한 플랫폼에서 동작할 수 있게 서비스 형태로 제공합니다.
 * 
 * 조건 컴파일을 통하여 구현될 예정입니다.
 */
class ElectronService extends EventEmitter {

    constructor() {
        super();
    }

    openFolder(folderName: string) {

    }

    

}

export {ElectronService};