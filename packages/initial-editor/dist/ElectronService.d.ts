import { EventEmitter } from "./EventEmitter";
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
declare class ElectronService extends EventEmitter {
    static INSTANCE: ElectronService;
    static getInstance(): ElectronService;
    constructor();
    /**
     * 이벤트를 차례대로 접근해 호출합니다.
     */
    makeEvents(): IterableIterator<string>;
    private listenEvents;
    /**
     * 폴더를 엽니다.
     *
     * @param folderName
     */
    openFolder(folderName?: string): void;
    getWindow(): void;
    maximize(): void;
    close(): void;
    showErrorMessageBox(title: string, message: string): void;
    quit(): Promise<void>;
}
export { ElectronService };
