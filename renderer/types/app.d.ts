import { EventEmitter } from "./EventEmitter";
import { Mouse } from "./Mouse";
export default class App extends EventEmitter {
    static Instance: App;
    /** 에디터 설정 파일 */
    private _config;
    /** 마우스 제어 */
    _mouse: Mouse;
    /**
     * 사각형 툴을 위한 제어 객체
     */
    private _blockRect?;
    /**
     * 현재 시간
     */
    private _now;
    /**
     * 컴포넌트가 초기화되어있는지 여부
     */
    private _isReady;
    /**
     * 타일 선택창
     */
    private _tilesetMarker;
    private _tilemap;
    /**
     * 타일맵 위에 겹쳐지는 타일 선택창 (오른쪽)
     */
    private _tileMarker;
    private _components;
    /** 메뉴 컴포넌트 */
    private _menu;
    /** 타일 선택창 묘화 */
    private _tilesetCanvas;
    private cache?;
    private _isMenuOpen?;
    private _tileId?;
    private _menuController?;
    /**
     * 멤버 변수를 초기화합니다.
     */
    initMembers(): void;
    /**
     * 컴포넌트를 생성합니다.
     */
    createComponents(): void;
    /**
     * 컴포넌트를 초기화합니다.
     */
    initWithComponents(): Promise<void>;
    toCamelCase(): string;
    /**
     * 모바일 디바이스에서 실행하고 있는지 여부를 파악합니다.
     * @return {Boolean}
     */
    isMobileDevice(): Boolean;
    onMouseTouchMove(ev: any): void;
    /**
     * 마우스 이벤트 및 터치 이벤트를 초기화합니다.
     */
    initWithMouseEvent(): void;
    setTileId(tileId: number): void;
    /**
     * 레이어를 토글하는 기능을 수행합니다.
     */
    initWithMapLayers(): void;
    start(): void;
    /**
     * 매 프레임마다 반복 실행되는 메소드입니다.
     * @param {Number}} deltaTime
     */
    update(deltaTime: number): void;
    /**
     * 메뉴가 열려있을 때 선별적으로 컴포넌트를 업데이트 합니다.
     */
    updateComponents(): void;
    /**
     * 이 메소드는 HTML 파일로부터 전역 호출을 받기 위해 존재합니다.
     * 창을 생성하게 되면 HTML 파일을 AJAX를 이용하여 비동기 적으로 불러오게 됩니다.
     * 창은 생성 직후, 화면에서 감춰진 상태로 존재하게 됩니다.
     *
     * HTML 파일 내부에는 로드가 완료되었음을 감지하는 콜백 함수가 걸려 있습니다.
     *
     * 그 콜백 함수가 바로 이 함수이며 이 함수가 실행되면 화면에 창이 보여지게 됩니다.
     *
     * 창 생성 요청
     *              ->  HTML 파일 로드 요청
     *              ->  로드 시작
     *              ->  로드 완료
     *              ->  렌더링 시작
     *              ->  렌더링 완료 후, 브라우저에 의해 window.app.onLoad 함수가 자동으로 실행됨.
     *
     * 창은 특별한(Unique) ID 값에 의해 식별되며 이 값은 문자열입니다.
     *
     * @param {HTMLElement} elem
     * @param {String}} id
     */
    onLoad(elem: HTMLElement, id: string): void;
    /**
     * 유일한 인스턴스를 반환하는 메소드입니다.
     * 일렉트론 환경에서는 별도의 전역 변수를 사용하므로 사용되지 않습니다.
     *
     * @return {App}
     */
    static GetInstance(): App;
    test(): void;
}
