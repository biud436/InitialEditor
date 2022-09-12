import { uuid } from "uuidv4";

export function useUUID(joinableText?: string) {
    const key = uuid();
    const joinable = key.replace(/-/g, "");

    return [key, joinable.concat("_", joinable)];
}
