import { Schema } from "./Schema";
declare class MapSchema extends Schema {
    Name: string;
    Id: number;
    MapWidth: number;
    MapHeight: number;
    Data: any[];
    Tilesets: any[];
    initMembers(config: any): void;
}
export { MapSchema };
