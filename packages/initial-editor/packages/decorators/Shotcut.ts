import { platform } from "os";
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

        const platform = process.platform;

        if (platform === "darwin") {
            key = key.map((k) => k.replace("ctrl", "command"));
        }

        shotcutService.bind(key.join("+"), action);
    };
}
