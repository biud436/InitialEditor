/**
 * @author Eo Jinseok
 * @class Renderer
 */
export default class BaseController {
    /**
     * @param {GamePropertiesWindow} config
     */
    constructor(config: any);
    initMembers(config: any): void;
    /**
     * 실제 HTML 파일이 있는 위치
     */
    _config: any;
    _isValid: boolean;
    _uniqueId: any;
    setUniqueId(id: any): void;
    initWithCanvas(): void;
    _element: JQuery<HTMLElement>;
    isMobile(): boolean;
    hide(): void;
    show(): void;
    remove(): void;
    load(): Promise<any>;
    render(): Promise<void>;
    onLoad(elem: any, self: any): void;
    addEventHandlers(elem: any, self: any): void;
}
