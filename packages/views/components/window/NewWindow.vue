<template>
    <base-window-frame
        name="newFileWindow"
        v-bind:width="256"
        v-bind:height="256"
    >
        <template #content>
            <div class="newContainer">
                <div id="newWindow" window-name="게임 속성" ref="newWindow">
                    <ul>
                        <li>
                            <label for="name">게임명 : </label
                            ><input
                                type="text"
                                placeholder="name"
                                v-model="title"
                            />
                        </li>
                        <li>
                            <label for="name">위치 : </label
                            ><input
                                type="file"
                                placeholder=""
                                webkitdirectory
                                directory
                                multiple
                                @change="onFileChange($event)"
                            />
                        </li>
                        <li>
                            <label for="name">작성자 명 : </label
                            ><input
                                type="text"
                                placeholder=""
                                v-model="project.author"
                            />
                        </li>
                    </ul>
                    <div class="newWindow__control-box">
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
                    <div class="panel">
                        <button>
                            <i class="fas fa-upload"></i>프로젝트 생성
                        </button>
                    </div>
                </div>
            </div>
        </template>
    </base-window-frame>
</template>
<script>
import BaseWindowFrame from "./BaseWindowFrame.vue";
export default {
    components: {
        BaseWindowFrame,
    },
    data() {
        return {
            title: "",
            project: {
                path: [],
                author: "",
            },
        };
    },
    mounted() {
        $(this.$refs.newWindow).draggable();
    },
    methods: {
        close() {
            this.$router.push("home");
        },
        onFileChange(e) {
            this.project.path = e.target.files;
            console.log(e.target.files);
        },
    },
};
</script>
<style lang="scss" scoped>
#newWindow {
    width: 256px;
    height: 240px;
    position: relative;
    left: 50%;
    display: flex;
    align-self: center;

    ul {
        margin: 0;
        padding: 0;
        padding-top: 0.75;

        li {
            display: inline-block;
            list-style-type: none;
        }
    }

    .newWindow__control-box {
        position: absolute;
        top: -1em;
        right: 0.625em;
        text-align: right;
        width: 1.5em;
        height: 1.5em;
    }

    label {
        font: menu;
        display: inline-block;
        width: 4em;
    }

    .newWindow__control-box i:hover {
        color: var(--dark-selection-color);
    }

    input {
        width: 60%;
    }

    .panel {
        position: absolute;
        right: 0;
        bottom: 0;
        margin-bottom: 1.25em;
        margin-right: 1.25em;
    }
    button {
        background-color: var(--dark-title-color);
        border: 1px solid var(--dark-border-color);
    }
}
</style>
