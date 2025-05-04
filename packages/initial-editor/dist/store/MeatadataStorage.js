var __decorate = (this && this.__decorate) || function (decorators, target, key, desc) {
    var c = arguments.length, r = c < 3 ? target : desc === null ? desc = Object.getOwnPropertyDescriptor(target, key) : desc, d;
    if (typeof Reflect === "object" && typeof Reflect.decorate === "function") r = Reflect.decorate(decorators, target, key, desc);
    else for (var i = decorators.length - 1; i >= 0; i--) if (d = decorators[i]) r = (c < 3 ? d(r) : c > 3 ? d(target, key, r) : d(target, key)) || r;
    return c > 3 && r && Object.defineProperty(target, key, r), r;
};
import Container, { Service } from "typedi";
/**
 * @class MetadataStorage
 */
let MetadataStorage = class MetadataStorage {
    constructor() {
        this.menuCommands = [];
        this.menuActions = [];
    }
    getCommand(name) {
        return this.menuCommands.find((command) => command.name === name);
    }
    getCommandItems(menuId) {
        const command = this.getCommand(menuId);
        if (!command) {
            console.warn(`command named '${menuId}' not found`);
            return;
        }
        const ret = {
            ...command,
            name: menuId,
        };
        return ret;
    }
};
MetadataStorage = __decorate([
    Service()
], MetadataStorage);
export { MetadataStorage };
/**
 * Getting the metadata storage from the global scope.
 *
 * @returns {MetadataStorage} MetadataStorage
 */
export function getMetadataStorage() {
    const storage = Container.get(MetadataStorage);
    return storage;
}
//# sourceMappingURL=MeatadataStorage.js.map