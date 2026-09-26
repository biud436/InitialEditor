export class Platform {
    static isElectron() {
        if (typeof process !== "undefined") {
            return true;
        }
        if (typeof window !== "undefined") {
            return false;
        }
        return false;
    }
}
//# sourceMappingURL=Platform.js.map