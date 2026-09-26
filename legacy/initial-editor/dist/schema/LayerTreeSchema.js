import { Schema } from "./Schema";
/**
 * @class LayerTreeSchema
 */
export class LayerTreeSchema extends Schema {
    initMembers(config) {
        this.Layers = [
            { DefaultOpacity: 1 },
            { DefaultOpacity: 1 },
            { DefaultOpacity: 1 },
            { DefaultOpacity: 1 },
        ];
        this.SemiTransparentOpacity = 0.25;
    }
}
//# sourceMappingURL=LayerTreeSchema.js.map