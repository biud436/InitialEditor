/**
 * 타일맵의 히스토리를 관리하는 클래스입니다.
 * Undo/Redo 기능을 제공합니다.
 *
 * @author biud436
 */
export class TilemapHistory {
    private _history: number[][] = [];
    private _currentIndex: number = -1;
    private _maxHistorySize: number = 50;

    constructor(maxHistorySize: number = 50) {
        this._maxHistorySize = maxHistorySize;
    }

    /**
     * 현재 상태를 히스토리에 저장합니다.
     * @param data 타일맵 데이터 배열
     */
    public push(data: number[]): void {
        // 현재 인덱스 이후의 히스토리를 제거합니다 (새로운 작업을 수행한 경우)
        if (this._currentIndex < this._history.length - 1) {
            this._history = this._history.slice(0, this._currentIndex + 1);
        }

        // 데이터를 깊은 복사하여 저장합니다
        const copy = new Array(data.length);
        for (let i = 0; i < data.length; i++) {
            copy[i] = data[i];
        }
        this._history.push(copy);
        this._currentIndex++;

        // 최대 히스토리 크기를 초과하면 가장 오래된 항목을 제거합니다
        if (this._history.length > this._maxHistorySize) {
            this._history.shift();
            this._currentIndex--;
        }
    }

    /**
     * 이전 상태로 되돌립니다.
     * @returns 이전 상태의 데이터 또는 null
     */
    public undo(): number[] | null {
        if (!this.canUndo()) {
            return null;
        }

        this._currentIndex--;
        const data = this._history[this._currentIndex];
        const copy = new Array(data.length);
        for (let i = 0; i < data.length; i++) {
            copy[i] = data[i];
        }
        return copy;
    }

    /**
     * 다시 실행합니다.
     * @returns 다음 상태의 데이터 또는 null
     */
    public redo(): number[] | null {
        if (!this.canRedo()) {
            return null;
        }

        this._currentIndex++;
        const data = this._history[this._currentIndex];
        const copy = new Array(data.length);
        for (let i = 0; i < data.length; i++) {
            copy[i] = data[i];
        }
        return copy;
    }

    /**
     * Undo가 가능한지 확인합니다.
     */
    public canUndo(): boolean {
        return this._currentIndex > 0;
    }

    /**
     * Redo가 가능한지 확인합니다.
     */
    public canRedo(): boolean {
        return this._currentIndex < this._history.length - 1;
    }

    /**
     * 히스토리를 초기화합니다.
     */
    public clear(): void {
        this._history = [];
        this._currentIndex = -1;
    }

    /**
     * 현재 히스토리 상태를 반환합니다.
     */
    public getStatus(): { current: number; total: number } {
        return {
            current: this._currentIndex,
            total: this._history.length,
        };
    }
}
