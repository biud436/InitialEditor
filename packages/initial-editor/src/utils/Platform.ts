export class Platform {
    public static isElectron(): boolean {
        if (typeof process !== "undefined") {
            return true;
        }

        if (typeof window !== "undefined") {
            return false;
        }

        return false;
    }
}
