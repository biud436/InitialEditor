import { Schema } from "./Schema";
export interface Layer {
    DefaultOpacity: number;
}
export declare type LayerCollection = [Layer, Layer, Layer, Layer];
/**
 * @class LayerTreeSchema
 */
export declare class LayerTreeSchema extends Schema {
    /**
     * 각 레이어의 투명도입니다.
     * 추후에 사용할 예정입니다.
     */
    Layers: LayerCollection;
    /**
     * 레이어가 선택되지 않았을 때의 기본 투명도를 정의합니다.
     */
    SemiTransparentOpacity: number;
    initMembers(config: any): void;
}
