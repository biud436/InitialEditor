// const path = require("path");
// const nextTranslate = require("next-translate");

// /**
//  * @type {import('next/config').NextConfig}
//  */
// module.exports = nextTranslate({
//   /**
//    * @param {import('next').NextConfig} config
//    **/
//   webpack: (config, { isServer }) => {
//     if (!isServer) {
//       config.target = "electron-renderer";
//       config.node = {
//         __dirname: true,
//       };

//       // config.resolve.alias = {
//       //     "@components": path.resolve(__dirname, "components"),
//       // };
//     }

//     return config;
//   },
//   sassOptions: {
//     includePaths: [path.join(__dirname, "styles")],
//   },
// });

const path = require("path");

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

        config.module.rules.push({
            test: /\.(png|jpg|gif)$/,
            use: [
                {
                    loader: "file-loader",
                },
            ],
        });

        return config;
    },
    sassOptions: {
        includePaths: [path.join(__dirname, "styles")],
    },
};
