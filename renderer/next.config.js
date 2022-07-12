const path = require("path");
const nextTranslate = require("next-translate");

/**
 * @type {import('next/config').NextConfig}
 */
module.exports = nextTranslate({
    /**
     * @param {import('next').NextConfig} config
     **/
    webpack: (config, { isServer }) => {
        if (!isServer) {
            config.target = "electron-renderer";
            config.node = {
                __dirname: true,
            };
        }

        return config;
    },
    sassOptions: {
        includePaths: [path.join(__dirname, "styles")],
    },
});
