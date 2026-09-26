import { getShotcutService } from "../services/ShotcutService";
/**
 * Method Decorator
 * @param key
 * @returns
 */
export function Shotcut(key) {
    return function (target, propertyKey, descriptor) {
        const action = descriptor.value;
        const shotcutService = getShotcutService();
        shotcutService.bindEx(key.join("+"), action);
    };
}
//# sourceMappingURL=Shotcut.js.map