import axios from "axios";
import * as fs from "fs";
var InitialEditor;
(function (InitialEditor) {
    /*
     * @namespace WebRequest
     * @description 웹 요청을 보내는 클래스입니다.
     */
    class WebRequest {
        static async get(url, config) {
            return axios.get(url, config);
        }
        static async post(url, data) {
            return axios.post(url, data);
        }
        static async put(url, data) {
            return axios.put(url, data);
        }
        static async delete(url) {
            return axios.delete(url);
        }
    }
    InitialEditor.WebRequest = WebRequest;
    class WebDownloader {
        static async download(url, filePath) {
            const response = await WebRequest.get(url);
            // content-type
            const contentType = response.headers["content-type"];
            const data = response.data;
            if (contentType.indexOf("application/octet-stream") !== -1) {
                return await fs.promises.writeFile(filePath, data);
            }
            const buffer = Buffer.from(data, "binary");
            if (!Buffer.isBuffer(buffer)) {
                return Promise.reject(new Error("Invalid data"));
            }
            return await fs.promises.writeFile(filePath, data);
        }
    }
    InitialEditor.WebDownloader = WebDownloader;
})(InitialEditor || (InitialEditor = {}));
export default InitialEditor;
//# sourceMappingURL=WebRequest.js.map