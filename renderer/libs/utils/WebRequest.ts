import axios, { AxiosRequestConfig, AxiosResponse } from "axios";
import * as fs from "fs";

namespace InitialEditor {
    export class WebRequest {
        public static get(
            url: string,
            config?: AxiosRequestConfig<any>
        ): Promise<AxiosResponse<any, any>> {
            return axios.get(url, config);
        }

        public static post(
            url: string,
            data?: any
        ): Promise<AxiosResponse<any, any>> {
            return axios.post(url, data);
        }

        public static put(url: string, data?: any): Promise<any> {
            return axios.put(url, data);
        }

        public static delete(url: string): Promise<any> {
            return axios.delete(url);
        }
    }

    export class WebDownloader {
        public static async download(
            url: string,
            filePath: string
        ): Promise<any> {
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
