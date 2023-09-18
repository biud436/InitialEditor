const createMediaQuery = (maxWidth: number) => {
    return `@media screen and (max-width: ${maxWidth}px)`;
};

export const media = {
    mobile: createMediaQuery(767),
    tablet: createMediaQuery(1023),
    desktop: createMediaQuery(1279),
    large: createMediaQuery(1439),
    widescreen: createMediaQuery(1919),
    fullhd: createMediaQuery(2559),
    ultra: createMediaQuery(3999),
};
