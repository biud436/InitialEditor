import { getShotcutService } from "../services/ShotcutService";

/**
 * Method Decorator
 * @param key
 * @returns
 */
export function Shotcut(key: string[]): MethodDecorator {
    return function (target: any, propertyKey, descriptor) {
        const action = descriptor.value as any;
        const shotcutService = getShotcutService();

        shotcutService.bind(key.join("+"), action);
    };
}
