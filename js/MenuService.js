import {Component} from "./Component.js";
import {MenuComponent} from "./MenuComponent.js";
import App from "./App.js";
import GamePropertiesWindowController from "./controllers/GamePropertiesWindowController.js";
import GamePropertiesWindow from "./models/GamePropertiesWindow.js";

const menu = {
    "ko": {
        file: {
            name: "파일",
            children: {
                "file-new": {
                    name: "새로 만들기",
                    children: {},
                    action: function(ev) {
                        App.GetInstance().initWithGamePropertiesWindow();
                    }                    
                },
                "file-open": {
                    name: "파일 열기",
                    children: {}, 
                },
                "file-close": {
                    name: "파일 닫기",
                    children: {}, 
                },
                "file-save": {
                    name: "파일 저장",
                    children: {}, 
                },
                "file-preferences": {
                    name: "환경 설정",
                    children: {}, 
                },
                "file-export": {
                    name: "내보내기",
                    children: {}, 
                },
                "file-exit": {
                    name: "프로그램 종료",
                    children: {}, 
                },
            },
        },
        edit: {
            name: "편집",
            children: {
                "edit-undo": {
                    name: "취소",
                    children: {},
                },
                "edit-cut": {
                    name: "자르기",
                    children: {}, 
                },
                "edit-copy": {
                    name: "복사하기",
                    children: {}, 
                },
                "edit-paste": {
                    name: "붙여넣기",
                    children: {}, 
                },
                "edit-delete": {
                    name: "삭제하기",
                    children: {}, 
                },
            },
        },
        mode: {
            name: "모드",
            children: {
                "mode-map": {
                    name: "맵",
                    children: {},                    
                },
                "mode-event": {
                    name: "이벤트",
                    children: {}, 
                },
                "mode-region": {
                    name: "지역",
                    children: {}, 
                },
            },
        },
        draw: {
            name: "그리기",
            children: {
                "draw-pencil": {
                    name: "펜",
                    children: {},
                    action: (ev) => {
                        
                    },                            
                },
                "draw-rectangle": {
                    name: "정사각형",
                    children: {}, 
                    action: (ev) => {
                        
                    },                            
                },
                "draw-ellipse": {
                    name: "직사각형",
                    children: {}, 
                    action: (ev) => {
                        
                    },                            
                },
                "draw-flood-fill": {
                    name: "채우기",
                    children: {}, 
                    action: (ev) => {
                        
                    },                            
                },
                "draw-shadow pen": {
                    name: "그림자",
                    children: {}, 
                    action: (ev) => {
                        
                    },                            
                },
            },
        },
        scale: {
            name: "배율",
            children: {
                "scale-1x": {
                    name: "실제 비율",
                    children: {},
                    action: (ev) => {
                        
                    },                            
                },
                "scale-2x": {
                    name: "2배 축소",
                    children: {}, 
                    action: (ev) => {
                        
                    },                            
                },
                "scale-4x": {
                    name: "4배 축소",
                    children: {}, 
                    action: (ev) => {
                        
                    },                            
                },
                "scale-8x": {
                    name: "8배 축소",
                    children: {}, 
                    action: (ev) => {
                        
                    },                            
                },
            },
        },
        tools: {
            name: "도구",
            children: {
                "tools-database": {
                    name: "데이터베이스",
                    children: {},
                    action: (ev) => {
                        
                    },                            
                },
                "tools-resource-manager": {
                    name: "소재 관리자",
                    children: {}, 
                    action: (ev) => {
                        
                    },                            
                },
                "tools-script-eidtor": {
                    name: "스크립트 에디터",
                    children: {}, 
                    action: (ev) => {
                        
                    },                      
                },
                "tools-sound-test": {
                    name: "사운드 테스트",
                    children: {}, 
                },
                "tools-options": {
                    name: "옵션",
                    children: {}, 
                },
            },
        },
        game: {
            name: "게임",
            children: {
                "game-playtest": {
                    name: "플레이 테스트",
                    children: {},
                    action: (ev) => {
                        alert("플레이 테스트 기능을 지원하지 않습니다.");
                    },                      
                },
                "game-fullscreen": {
                    name: "전체 화면",
                    children: {}, 
                    action: (ev) => {
                        
                    },                     
                },
                "game-show-console": {
                    name: "콘솔 표시",
                    children: {}, 
                    action: (ev) => {
                        alert("웹 버전에서는 콘솔 표시 기능을 지원하지 않습니다.");
                    },                       
                },
                "game-folder-open": {
                    name: "게임 폴더 열기",
                    children: {}, 
                    action: (ev) => {
                        alert("웹 버전에서는 게임 폴더 열기 기능을 지원하지 않습니다.");
                    },                      
                },
            },
        },
        help: {
            name: "도움말",
            children: {
                "help-contents": {
                    name: "도움말",
                    children: {},
                    action: (ev) => {
                        alert("도움말이 아직 없습니다.");
                    },
                },
                "help-about": {
                    name: "버전 정보",
                    children: {}, 
                    action: (ev) => {
                        // if(!$(".container").is("#helpAbout")) {
                        //     $(".container").append(new HelpAboutWindow(new HelpAboutWindowModel()));
                        // }
                    },                    
                },
            },
        },
        "$font": {
            size: "8pt",
        }
    },
};

export default class MenuService extends Component {

    initMembers(...args) {

        /**
         * @type {MenuComponent}
         */
        this._menuComponent = args[1];
        this._isClickedMenu = false;        
    }

    start(...args) {

        this.changeMenuLocaleAsPersonalize();
        this.changeToolbarIconOnMobileDevice();
        this.addMenuEventHandlers();
    }    

    changeMenuLocaleAsPersonalize() {
        const langCode = navigator.language.slice(0, 2);
        $(".menu__main label").each((index, elem) => {
            const parent = $(elem);
            const type = parent.data("action");
            const res = menu[langCode];
            if(res) {
                const data = res[type];
                const name = data.name;
                const font = res["$font"];
                parent.text(name);
                parent.css("font-size", font.size);

                $(`.menu__${type}-sub li`)
                    .each((_index, _elem) => {
                        const _node = $(_elem);
                        
                        // 서브 메뉴의 위치를 세밀하게 조정합니다.
                        const menuNode = parent.parent();
                        _node.parent().css("left", menuNode.get(0).getBoundingClientRect().x + "px");

                        const _type = _node.data("action");
                        const _res = data.children[_type];
                        if(_res) {

                            // 메뉴 노드에 메뉴 액션을 등록합니다.
                            if(_res.action) {
                                _node.get(0).onclick = _res.action;
                            }

                            const _name = _res.name;
                            _node.get(0).childNodes.forEach(i => {
                                // 텍스트 노드만 찾습니다.
                                if(i.nodeType == 3) {
                                    i.textContent = _name;
                                }
                            });
                            _node.css("font-size", font.size);
                        }
                    })                

            }
        })
    }

    addMenuEventHandlers() {

        // let isDone = false;

        // $(".menu__main li").on("click", ev => {
        //     const isSomeMenuOpened = $("ul[class*='sub']").is(":visible");
        //     $("ul[class*='sub']").hide();
        //     $("#none").prop("checked", true);
        // });
    }

    changeToolbarIconOnMobileDevice() {
        const media = window.matchMedia("(max-width: 640px)");
        if(media.matches) {
            $(".toolbar i").each((index, elem) => {
                $(elem)
                    .addClass("fa-3x")
                    .css({
                        "width": "98%",
                        "height": "98%",
                        "font-size": "1.25em"
                    })
            })
        }

        const resizeConfig = {
            ".contents": {
                "width": "65%",
            },
            ".aside__tabs": {
                "width": "30%",
            },
            "#contents__main-canvas": {
                "width": "100%",
            }
        }

        $(window).on("resize", () => {

            if($(window).width() <= 640) {
                for(let i in resizeConfig) {
                    $(i).css(resizeConfig[i]);
                }

                $(".toolbar i").each((index, elem) => {
                    $(elem)
                        .removeClass("fa-3x")                    
                        .addClass("fa-3x")
                        .css({
                            "width": "98%",
                            "height": "98%",
                            "font-size": "1.25em"
                        })
                })                
            } else {
                $(".toolbar i").each((index, elem) => {
                    $(elem)
                        .removeClass("fa-3x") 
                        .addClass("fa-sm")                   
                        .css({
                            "width": "98%",
                            "height": "98%",
                            "font-size": "0.875em"
                        })
                })  
            }
        })
    }
}