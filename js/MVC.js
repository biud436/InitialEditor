/**
 * @see
 * https://alexatnet.com/model-view-controller-mvc-in-javascript/
 */
class EventEmitter {
    constructor() {
        this.initMembers();
    }

    initMembers() {
        this._events = {};
    }

    on(evt, listener) {
        if(!this._events[evt]) {
            this._events[evt] = [];
        }
        
        if(!(listener instanceof Function)) {
            listener = function() {};
        }

        this._events[evt].push(listener);

        return this;
    }

    emit(evt, ...args) {
        const events = this._events[evt] || [];
        events.slice().forEach(listener => {
            listener(...args);
        })
    }
}

class Model extends EventEmitter {
    constructor(items) {
        super();

        this._items = items || [];
        this._selectedIndex = -1;
    }

    getItems() {
        return this._items.slice();
    }

    addItems(item) {
        this._items.push(item);
        this.emit("itemAdded", item);
    }

    removeItemAt(index) {

    }

    get selectedIndex() {

    }

    set selectedIndex(index) {

    }

}

class View extends EventEmitter {
    constructor(model, elements) {
        super();
        
        this._model = model;
        this._elements = elements;

        // 모델 이벤트 리스너 추가
        // 요소 이벤트 리스너 추가 후, emit 메서드를 호출하여 버튼 클릭을 알림
    }

    show() {

    }

    rebuildList() {

    }
}

class Controller {
    constructor(model, view) {
        this._model = model;
        this._view = view;

        // 뷰 이벤트 리스너 추가
    }

    /**
     * TODO: 실제 HTMLElement의 동작을 여기에 추가
     */

    addItem() {

    }

    delItem() {

    }

    updateSelected(index) {

    }
}

export {EventEmitter, Model, View, Controller};