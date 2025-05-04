export declare class ShotcutService {
    private mousetrap;
    constructor();
    bind(key: string, callback: () => void): void;
}
export declare function getShotcutService(): ShotcutService;
