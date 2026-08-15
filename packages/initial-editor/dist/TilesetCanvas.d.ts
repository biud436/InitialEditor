import "reflect-metadata";
import { CompositeLayout } from "./map/MapFormat";
export type ColorRGBFormat = [number, number, number];
export type InitialTexture = {
    naturalWidth: number;
    naturalHeight: number;
    buffer: ImageData["data"];
};
export default class TilesetCanvas {
    private _config;
    private _isReady;
    private _tilesetImgages;
    private _tilesets;
    private _parent;
    private _canvas;
    private _context;
    constructor(...args: any[]);
    initMembers(...args: any[]): void;
    start(...args: any[]): Promise<unknown>;
    loadTilesets(): Promise<unknown>;
    /**
     * 이 메소드는 타일셋을 지우고 다시 처음부터 그립니다.
     * 새로운 이미지가 있으면 맨 아래에 추가됩니다.
     */
    refreshTilesets(newTileset: string): Promise<void>;
    get isReady(): boolean;
    /**
     * 합성 캔버스의 배치(어느 이미지가 어느 세로 구간을 차지하는지)를 돌려준다.
     * createCanvas 와 같은 규칙(설정 순서대로 위에서 아래로, 각 이미지의 naturalHeight 만큼)이므로
     * 맵 내보내기와 불러오기(map/MapFormat.ts)가 전역 타일 ID 를 타일셋별 지역 ID 로 바꿀 때 쓴다.
     */
    getLayout(): CompositeLayout;
    /**
     * HEX 컬러를 웹 색상으로 변환합니다.
     * @param hex
     * @returns
     */
    private hexToRgb;
    /**
     * 특정 색을 투명하게 만듭니다.
     * 일부 타일셋의 경우, 알파 채널이 없는 경우가 있습니다.
     * 이 경우, 투명도를 적용할 수 없기 때문에 이미지 프로세싱이 필요합니다.
     *
     * 픽셀 셰이터를 통해 투명화하면 하드웨어 가속이 가능하지만,
     * 타일셋 뷰가 캔버스로 구현되어있기 때문에 소프트웨어 렌더링으로 처리됩니다.
     *
     * @param imageData
     * @param width
     * @param height
     * @param targetColor
     * @param isAlpha
     * @returns
     */
    private convertWithUInt8Array;
    /**
     * 이미지 데이터를 획득합니다.
     * @param img
     * @returns
     */
    private getImageData;
    createCanvas(): Promise<void>;
}
