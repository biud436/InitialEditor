export declare class ShotcutService {
    private mousetrap;
    constructor();
    /**
     * 콜백이 false 를 돌려주면 Mousetrap 이 브라우저 기본 동작을 막는다 (preventDefault).
     */
    bindEx(key: string, callback: (ev?: unknown, combo?: string) => boolean | void): void;
}
export declare function getShotcutService(): ShotcutService;
