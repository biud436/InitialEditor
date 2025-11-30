import axios, { AxiosRequestConfig, AxiosResponse } from "axios";

// fs 모듈은 Node.js 환경에서만 사용 가능
let fs: any;
try {
    fs = require("fs");
} catch (e) {
    // 브라우저 환경에서는 fs를 사용할 수 없음
    fs = null;
}

namespace InitialEditor {
    /*
     * @namespace WebRequest
     * @description 웹 요청을 보내는 클래스입니다.
     */
    export class WebRequest {
        public static async get(
            url: string,
            config?: AxiosRequestConfig<any>,
        ): Promise<AxiosResponse<any, any>> {
            return axios.get(url, config);
        }

        public static async post(
            url: string,
            data?: any,
        ): Promise<AxiosResponse<any, any>> {
            return axios.post(url, data);
        }
        public static async put(url: string, data?: any): Promise<any> {
            return axios.put(url, data);
        }

        public static async delete(url: string): Promise<any> {
            return axios.delete(url);
        }
    }

    export class WebDownloader {
        public static async download(
            url: string,
            filePath: string,
        ): Promise<any> {
            if (!fs) {
                return Promise.reject(
                    new Error(
                        "fs module is not available in browser environment",
                    ),
                );
            }
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
}

export default InitialEditor;
