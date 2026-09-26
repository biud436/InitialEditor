/**
 * 타일맵의 히스토리를 관리하는 클래스입니다.
 * Undo/Redo 기능을 제공합니다.
 *
 * @author biud436
 */
export declare class TilemapHistory {
    private _history;
    private _currentIndex;
    private _maxHistorySize;
    constructor(maxHistorySize?: number);
    /**
     * 현재 상태를 히스토리에 저장합니다.
     * @param data 타일맵 데이터 배열
     */
    push(data: number[]): void;
    /**
     * 이전 상태로 되돌립니다.
     * @returns 이전 상태의 데이터 또는 null
     */
    undo(): number[] | null;
    /**
     * 다시 실행합니다.
     * @returns 다음 상태의 데이터 또는 null
     */
    redo(): number[] | null;
    /**
     * Undo가 가능한지 확인합니다.
     */
    canUndo(): boolean;
    /**
     * Redo가 가능한지 확인합니다.
     */
    canRedo(): boolean;
    /**
     * 히스토리를 초기화합니다.
     */
    clear(): void;
    /**
     * 현재 히스토리 상태를 반환합니다.
     */
    getStatus(): {
        current: number;
        total: number;
    };
}
