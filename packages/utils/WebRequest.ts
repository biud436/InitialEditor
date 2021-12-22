import axios, { AxiosRequestConfig } from "axios";

namespace InitialEditor {
    export class WebRequest {
        public static async get(
            url: string,
            config?: AxiosRequestConfig<any>
        ): Promise<any> {
            return axios.get(url, config);
        }

        public static async post(url: string, data?: any): Promise<any> {
            return axios.post(url, data);
        }
    }
}

export = InitialEditor;
