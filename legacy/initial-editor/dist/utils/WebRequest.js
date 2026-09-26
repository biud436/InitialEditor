import axios from "axios";
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
            return Promise.reject("Not implemented");
        }
    }
    InitialEditor.WebDownloader = WebDownloader;
})(InitialEditor || (InitialEditor = {}));
export default InitialEditor;
//# sourceMappingURL=WebRequest.js.map