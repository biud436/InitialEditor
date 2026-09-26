export declare class ShotcutService {
    private mousetrap;
    constructor();
    bindEx(key: string, callback: () => void): void;
}
export declare function getShotcutService(): ShotcutService;
