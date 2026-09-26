import axios, { AxiosRequestConfig, AxiosResponse } from "axios";

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
            return Promise.reject("Not implemented");
        }
    }
}

export default InitialEditor;
