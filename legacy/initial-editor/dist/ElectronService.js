var __decorate = (this && this.__decorate) || function (decorators, target, key, desc) {
    var c = arguments.length, r = c < 3 ? target : desc === null ? desc = Object.getOwnPropertyDescriptor(target, key) : desc, d;
    if (typeof Reflect === "object" && typeof Reflect.decorate === "function") r = Reflect.decorate(decorators, target, key, desc);
    else for (var i = decorators.length - 1; i >= 0; i--) if (d = decorators[i]) r = (c < 3 ? d(r) : c > 3 ? d(target, key, r) : d(target, key)) || r;
    return c > 3 && r && Object.defineProperty(target, key, r), r;
};
var __metadata = (this && this.__metadata) || function (k, v) {
    if (typeof Reflect === "object" && typeof Reflect.metadata === "function") return Reflect.metadata(k, v);
};
var ElectronService_1;
import { EventEmitter } from "./EventEmitter";
import { Component } from "./component";
import { Service } from "typedi";
import { Platform } from "./utils/Platform";
/**
 * @class ElectronService
 * @deprecated
 * @description
 * 일렉트론과 IPC를 하기 위해 만든 클래스입니다.
 *
 * 다양한 플랫폼에서 동작할 수 있게 서비스 형태로 제공합니다.
 *
 * 조건 컴파일을 통하여 구현될 예정입니다.
 */
let ElectronService = ElectronService_1 = class ElectronService extends EventEmitter {
    static getInstance() {
        return ElectronService_1.INSTANCE;
    }
    constructor() {
        super();
        this.listenEvents();
    }
    /**
     * 이벤트를 차례대로 접근해 호출합니다.
     */
    *makeEvents() {
        yield "minimize";
        yield "maximize";
        yield "restore";
        yield "close";
    }
    listenEvents() {
        const generator = this.makeEvents();
        while (true) {
            const event = generator.next();
            if (event.done)
                break;
            const value = event.value.toString();
            this.on(value, () => {
                // ipcRenderer.send(value);
            });
        }
    }
    /**
     * 폴더를 엽니다.
     *
     * @param folderName
     */
    openFolder(folderName = "") {
        if (!Platform.isElectron()) {
            alert("폴더 열기는 웹 버전에선 지원하지 않습니다.");
            return;
        }
        // const current = path.join(folderName.replace(/\\/g, "/"));
        // shell.showItemInFolder(current);
    }
    getWindow() {
        // remote module is deprecated in Electron v14.0
        // https://www.electronjs.org/docs/latest/breaking-changes#planned-breaking-api-changes-140
    }
    maximize() {
        // ipcRenderer.send("maximize");
    }
    close() {
        this.quit();
    }
    showErrorMessageBox(title, message) {
        MessageBoxComponent.showError(title, message);
    }
    quit() {
        // return Promise.resolve(ipcRenderer.send("close"));
        return Promise.resolve();
    }
};
ElectronService.INSTANCE = new ElectronService_1();
ElectronService = ElectronService_1 = __decorate([
    Service(),
    __metadata("design:paramtypes", [])
], ElectronService);
/**
 * @class MessageBoxComponent
 * @deprecated
 */
class MessageBoxComponent extends Component {
    static showError(title, message) {
        // ipcRenderer.send("message_box:error", title, message);
        alert(`${title}\n${message}`);
    }
}
export { ElectronService };
//# sourceMappingURL=ElectronService.js.map