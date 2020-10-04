import {Schema} from "./Schema.js";

class MapSchema extends Schema {
    initMembers(config) {
        this.Name = "None",
        this.Id = 1,
        this.MapWidth = 17;
        this.MapHeight = 13;        
        this.Data = [];
        this.Tilesets = [];
    }
}

export {MapSchema};