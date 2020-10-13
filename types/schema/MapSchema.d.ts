export class MapSchema extends Schema {
    constructor(config: any);
    Name: string;
    Id: number;
    MapWidth: number;
    MapHeight: number;
    Data: any[];
    Tilesets: any[];
}
import { Schema } from "./Schema.js";
