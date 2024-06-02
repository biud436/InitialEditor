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
@Service()
class ElectronService extends EventEmitter {
    public static INSTANCE: ElectronService = new ElectronService();

    public static getInstance(): ElectronService {
        return ElectronService.INSTANCE;
    }

    constructor() {
        super();
        this.listenEvents();
    }

    /**
     * 이벤트를 차례대로 접근해 호출합니다.
     */
    public *makeEvents(): IterableIterator<string> {
        yield "minimize";
        yield "maximize";
        yield "restore";
        yield "close";
    }

    private listenEvents() {
        const generator = this.makeEvents();

        while (true) {
            const event = generator.next();
            if (event.done) break;

            const value = (<string>event.value).toString();

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
    public openFolder(folderName: string = ""): void {
        if (!Platform.isElectron()) {
            alert("폴더 열기는 웹 버전에선 지원하지 않습니다.");
            return;
        }

        // const current = path.join(folderName.replace(/\\/g, "/"));
        // shell.showItemInFolder(current);
    }

    public getWindow(): void {
        // remote module is deprecated in Electron v14.0
        // https://www.electronjs.org/docs/latest/breaking-changes#planned-breaking-api-changes-140
    }

    public maximize(): void {
        // ipcRenderer.send("maximize");
    }

    public close() {
        this.quit();
    }

    public showErrorMessageBox(title: string, message: string): void {
        MessageBoxComponent.showError(title, message);
    }

    public quit(): Promise<void> {
        // return Promise.resolve(ipcRenderer.send("close"));
        return Promise.resolve();
    }
}

/**
 * @class MessageBoxComponent
 * @deprecated
 */
class MessageBoxComponent extends Component {
    public static showError(title: string, message: string) {
        // ipcRenderer.send("message_box:error", title, message);
        alert(`${title}\n${message}`);
    }
}

export { ElectronService };
