const path = require("path");
const fs = require("fs");
const root = path.resolve(__dirname, "../");

fs.promises
    .copyFile(path.join(root, "index.html"), path.join(root, "dist/index.html"))
    .then(e => {
        console.log("index.html copied");
    })
    .catch(e => {
        console.log(e);
    });
