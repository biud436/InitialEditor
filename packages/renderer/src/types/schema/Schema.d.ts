declare class Schema {
    constructor(config: any);
    initMembers(config: any): void;
    /**
     * 멤버 변수를 JSON 데이터로 변환합니다.
     */
    toJson(): string;
    /**
     * 설정 파일을 로드하여 문자열로 반환합니다.
     *
     * @param filename
     * @returns
     */
    load(filename?: string): Promise<string>;
    /**
     * 파일로 내보냅니다 (비동기 방식)
     *
     * @param filename
     */
    toFile(filename?: string): Promise<void>;
}
export { Schema };
