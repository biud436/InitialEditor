import { uuid } from "uuidv4";

export function useUniqueKey(joinableText?: string) {
    const key = uuid();
    const joinable = key.replace(/-/g, "");

    return [key, joinable.concat("_", joinableText)];
}