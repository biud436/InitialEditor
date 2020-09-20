import {Component} from "./component.js";

const menu = {
    "ko": {
        file: {
            name: "파일",
            children: {
                "file-new": {
                    name: "새로 만들기",
                    children: {},
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
                },
                "draw-rectangle": {
                    name: "정사각형",
                    children: {}, 
                },
                "draw-ellipse": {
                    name: "직사각형",
                    children: {}, 
                },
                "draw-flood-fill": {
                    name: "채우기",
                    children: {}, 
                },
                "draw-shadow pen": {
                    name: "그림자",
                    children: {}, 
                },
            },
        },
        scale: {
            name: "배율",
            children: {
                "scale-1x": {
                    name: "실제 비율",
                    children: {},
                },
                "scale-2x": {
                    name: "2배 축소",
                    children: {}, 
                },
                "scale-4x": {
                    name: "4배 축소",
                    children: {}, 
                },
                "scale-8x": {
                    name: "8배 축소",
                    children: {}, 
                },
            },
        },
        tools: {
            name: "도구",
            children: {
                "tools-database": {
                    name: "데이터베이스",
                    children: {},
                },
                "tools-resource-manager": {
                    name: "소재 관리자",
                    children: {}, 
                },
                "tools-script-eidtor": {
                    name: "스크립트 에디터",
                    children: {}, 
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
                    name: "데이터베이스",
                    children: {},
                },
                "game-fullscreen": {
                    name: "소재 관리자",
                    children: {}, 
                },
                "game-show-console": {
                    name: "스크립트 에디터",
                    children: {}, 
                },
                "game-show-console": {
                    name: "스크립트 에디터",
                    children: {}, 
                },
                "game-folder-open": {
                    name: "게임 폴더 열기",
                    children: {}, 
                },
            },
        },
        help: {
            name: "도움말",
            children: {
                "help-contents": {
                    name: "도움말",
                    children: {},
                },
                "help-about": {
                    name: "버전 정보",
                    children: {}, 
                },
            },
        },
        "$font": {
            size: "8pt",
        }
    },
};

export default class Localization extends Component {
    start(...args) {
        this.changeMenuLocaleAsPersonalize();
        this.changeToolbarIconOnMobileDevice();
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

        $(window).on("resize", () => {
            if($(window).width() <= 640) {
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