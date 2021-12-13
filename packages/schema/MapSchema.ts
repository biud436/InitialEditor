import { Schema } from "./Schema.js";
class MapSchema extends Schema {
    Name: string;
    Id: number;
    MapWidth: number;
    MapHeight: number;
    Data: any[];
    Tilesets: any[];

    initMembers(config: any) {
        (this.Name = "None"), (this.Id = 1), (this.MapWidth = 17);
        this.MapHeight = 13;
        this.Data = [];
        this.Tilesets = [];
    }
}

export { MapSchema };
