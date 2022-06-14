import { AxiosRequestConfig, AxiosResponse } from "axios";
declare namespace InitialEditor {
    class WebRequest {
        static get(url: string, config?: AxiosRequestConfig<any>): Promise<AxiosResponse<any, any>>;
        static post(url: string, data?: any): Promise<AxiosResponse<any, any>>;
        static put(url: string, data?: any): Promise<any>;
        static delete(url: string): Promise<any>;
    }
    class WebDownloader {
        static download(url: string, filePath: string): Promise<any>;
    }
}
export default InitialEditor;
