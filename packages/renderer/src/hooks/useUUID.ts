import { v4 as uuidv4 } from "uuid";

export function useUUID(joinableText?: string) {
    const key = uuidv4();
    const joinable = key.replace(/-/g, "");

    return [key, joinable.concat("_", joinableText ?? "")];
}
