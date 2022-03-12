<template>
    <div id="tilesetWindow" window-name="타일셋 창" ref="tilesetWindow">
        <div
            class="tilesetWindow__tileset tilesetWindow__tab-border"
            tab-name="타일셋"
        >
            <ul>
                <li>
                    <label for="name">이름 : </label
                    ><input type="text" placeholder="name" name="name" />
                </li>
                <li>
                    <label for="name">이미지: </label>
                    <input type="file" name="" id="image-load-dialog" />
                </li>
            </ul>
        </div>
        <div
            class="tilesetWindow-tile tilesetWindow__tab-border"
            tab-name="타일"
        >
            <ul>
                <li>
                    <label for="tile-width">가로 크기 : </label
                    ><input
                        type="number"
                        id="tile-width"
                        value="32"
                        name="tileWidth"
                    />px
                </li>
                <li>
                    <label for="tile-height">세로 크기 : </label
                    ><input
                        type="number"
                        id="tile-height"
                        value="32"
                        name="tileHeight"
                    />px
                </li>
                <li>
                    <label for="theme">테마 설정 : </label>

                    <select
                        name="theme"
                        id="theme-select-box"
                        v-model="selectedIndex"
                    >
                        <option value="dark" selected>다크 테마</option>
                        <option value="light">라이트 테마</option>
                    </select>
                </li>
            </ul>
        </div>

        <div class="tilesetWindow__control-box">
            <p>
                <span
                    ><i
                        class="far fa-window-close"
                        id="action-close"
                        @click="close"
                    ></i
                ></span>
            </p>
        </div>

        <div class="tilesetWindow__panel">
            <button id="ok" @click="ok">확인</button>
            <button id="cancel" @click="close">취소</button>
        </div>
        <img
            src="data:image/gif;base64,R0lGODlhAQABAIAAAAAAAP///yH5BAEAAAAALAAAAAABAAEAAAIBRAA7"
            onload='window.app.onLoad(this, "tileset");this.parentNode.removeChild(this);'
        />
    </div>
</template>
<script>
import { mapGetters } from "vuex";

const SET_THEME = "api/setTheme";
const GET_THEME = "api/getTheme";

const THEME = {
    DARK: "dark",
    LIGHT: "light"
};
export default {
    data() {
        return {
            selectedIndex: "dark"
        };
    },
    mounted() {
        $(this.$refs.tilesetWindow).draggable();
        this.selectedIndex = this.theme;
    },
    computed: {
        ...mapGetters({
            theme: [GET_THEME]
        })
    },
    methods: {
        applyTheme() {
            const themeIndex = this.selectedIndex;

            const themeManager = new window.ThemeManager();

            if (themeIndex == THEME.DARK) {
                $("body").data("theme", "dark");
                themeManager.changeDarkTheme(true);
            } else {
                $("body").data("theme", "light");
                themeManager.changeLightTheme(true);
            }

            this.$store.dispatch(SET_THEME, themeIndex);

            this.returnToMain();
        },
        ok() {
            this.applyTheme();
        },
        close() {
            this.returnToMain();
        },
        returnToMain() {
            this.$router.push("home");
        }
    }
};
</script>
<style lang="scss">
#tilesetWindow {
    padding: 1em;
    background-color: inherit;
    overflow: hidden;
    background: var(--dark-shadow-color);
    opacity: 0.9;
    position: relative;
}

.tilesetWindow__tab-border {
    width: 100%;
    height: max-content;
    border: 1px solid var(--dark-border-color);
    border-radius: 0.4em;
    position: relative;
    background-color: inherit;
    margin-bottom: 1em;
    margin-top: 1.2em;
}

.tilesetWindow__tab-border::before {
    content: attr(tab-name);
    position: absolute;
    top: -0.7em;
    left: 0.8em;
    background-color: inherit;
    color: var(--dark-text-color);
    font: menu;
}

.tilesetWindow__tab-border ul li {
    margin-bottom: 0.5em;
    font: menu;
}

.tilesetWindow__tab-border input {
    text-align: right;
    background-color: var(--dark-input-background-color);
    color: var(--dark-input-text-color);
    border: var(--dark-border-color);
}

.tilesetWindow__tab-border input:focus {
    outline: none;
}

#tilesetWindow .tilesetWindow__control-box {
    position: absolute;
    top: -16px;
    right: 10px;
    text-align: right;
    width: 24px;
    height: 24px;
}

#tilesetWindow .tilesetWindow__control-box i:hover {
    color: var(--dark-selection-color);
}

.tilesetWindow__panel {
    float: right;
}

#tilesetWindow button {
    background-color: var(--dark-title-color);
    border: 1px solid var(--dark-border-color);
}

#tilesetWindow button:hover,
button:focus {
    outline: none;
    background-color: var(--dark-selection-color);
}

#tilesetWindow button:active {
    outline: none;
    background-color: rgba(60, 60, 60, 0.9);
}

#tilesetWindow select {
    background-color: var(--dark-selection-color);
    color: var(--dark---dark-text-color);
}

#tilesetWindow button {
    background-color: var(--dark-selection-color);
}
</style>
