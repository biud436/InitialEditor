<template>
    <base-window-frame name="newFileWindow">
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
        BaseWindowFrame
    },
    data() {
        return {
            title: "",
            project: {
                path: [],
                author: ""
            }
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
        }
    }
};
</script>
<style lang="css">
#newWindow {
    width: 256px;
    height: 240px;
    position: relative;
    left: 50%;
    display: flex;
    align-self: center;
}

#newWindow ul {
    margin: 0;
    padding: 0;
    padding-top: 12px;
}

#newWindow ul li {
    display: inline-block;
    list-style-type: none;
}

#newWindow .newWindow__control-box {
    position: absolute;
    top: -16px;
    right: 10px;
    text-align: right;
    width: 24px;
    height: 24px;
}

#newWindow label {
    font: menu;
    display: inline-block;
    width: 64px;
}

#newWindow .newWindow__control-box i:hover {
    color: var(--dark-selection-color);
}

#newWindow input {
    width: 60%;
}

#newWindow .panel {
    position: absolute;
    right: 0;
    bottom: 0;
    margin-bottom: 20px;
    margin-right: 20px;
}

#newWindow button {
    background-color: var(--dark-title-color);
    border: 1px solid var(--dark-border-color);
}
</style>
