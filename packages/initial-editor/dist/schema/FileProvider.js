const PREFIX_TOKEN = "initial-editor-fs:///";
export class FileProvider {
    getFilename(filename) {
        return PREFIX_TOKEN + filename;
    }
    readFile(filename, encoding, callback) {
        const retFileName = this.getFilename(filename);
        const content = localStorage.getItem(retFileName);
        if (!content) {
            return callback(new Error("File not found"));
        }
        return callback(null, content);
    }
    writeFile(filename, content, option, callback) {
        if (!option) {
            return callback(new Error("Invalid option"));
        }
        const retFileName = this.getFilename(filename);
        if (!content) {
            return callback(new Error("Invalid content"));
        }
        localStorage.setItem(retFileName, content);
        return callback(null);
    }
    readFileSync(filename, encoding) {
        if (!filename) {
            throw new Error("Invalid filename");
        }
        const retFileName = this.getFilename(filename);
        const content = localStorage.getItem(retFileName);
        if (!content) {
            throw new Error("File not found");
        }
        return content;
    }
    existsSync(filename) {
        if (!filename) {
            throw new Error("Invalid filename");
        }
        const retFileName = this.getFilename(filename);
        const content = localStorage.getItem(retFileName);
        if (!content) {
            return false;
        }
        return true;
    }
    writeFileSync(filename, content, encoding) {
        if (!filename) {
            throw new Error("Invalid filename");
        }
        const retFileName = this.getFilename(filename);
        if (!content) {
            throw new Error("Invalid content");
        }
        localStorage.setItem(retFileName, content);
    }
}
//# sourceMappingURL=FileProvider.js.map