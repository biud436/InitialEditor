export function hashCode(value) {
    const isValidASCII = isASCII(value);
    let hash = 0;
    value.split("").forEach((c) => {
        if (isValidASCII) {
            hash = (31 * hash) + (c.charCodeAt(0) & 0xFF);
        }
        else {
            hash = (31 * hash) + c.charCodeAt(0);
        }
    });
    return hash;
}
function isASCII(value) {
    let isASCII = false;
    value.split("").forEach((e) => {
        const code = e.charCodeAt(0);
        if (code >= 0 && code <= 255) {
            isASCII = true;
        }
        else {
            isASCII = false;
        }
    });
    return isASCII;
}
//# sourceMappingURL=hashCode.js.map