export function hashCode(value: string) {
    const isValidASCII = isASCII(value);
    let hash = 0;

    (value.split("") as string[]).forEach((c: string) => {
        if (isValidASCII) {
            hash = 31 * hash + (c.charCodeAt(0) & 0xff);
        } else {
            hash = 31 * hash + c.charCodeAt(0);
        }
    });

    return hash;
}

export function isASCII(value: string): Boolean {
    let isASCII = false;

    (value.split("") as string[]).forEach((e: string) => {
        const code = e.charCodeAt(0);

        if (code >= 0 && code <= 255) {
            isASCII = true;
        } else {
            isASCII = false;
        }
    });

    return isASCII;
}
