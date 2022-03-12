// @ts-check

module.exports = {
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
};
