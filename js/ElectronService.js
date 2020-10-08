import {EventEmitter} from "./EventEmitter";

/**
 * TODO: Electron과 관련된 기능은 모두 이 파일에 작성하고 이벤트로 처리할 것.
 * 공통적으로 사용되는 파일에 require 구문 모두 제거할 것.
 */
class ElectronService extends EventEmitter {
    constructor() {
        super();
    }
}

export {ElectronService};