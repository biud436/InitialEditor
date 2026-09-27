/// <reference types="vite/client" />

/** vite.config.ts 의 define 이 채운다 (package.json 의 version) */
declare const __APP_VERSION__: string;

/** vite.config.ts 의 define 이 채운다 (빌드한 커밋 앞 일곱 자리, 모르면 "dev") */
declare const __APP_COMMIT__: string;
