const fs = require("fs");
const path = require("path");
const argv = require("minimist")(process.argv.slice(2));
const cp = require("child_process");

if (argv.help) {
    console.log(`
        node build/types.js --parent="./"
    `);
    process.exit(-1);
}

let root = argv.parent || process.cwd();
const dirs = fs.readdirSync(path.join(root, "packages", "menu"), "utf8");

dirs.forEach(async (filename) => {
    const realFileName = path.join(path.join(root, "js", "menu"), filename);
    const command = `cmd /k "npx typescript ${realFileName} --declaration --allowJs --emitDeclarationOnly --outDir types"`;

    await cp.exec(
        command,
        (err, stdout, stderr) => {
            if (err) {
                throw new Error(`${realFileName} : ${err}`);
            }

            console.log(stdout);
        },
        (err) => {
            console.warn(`${realFileName} : ${err}`);
        }
    );
});
