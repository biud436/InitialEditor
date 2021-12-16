<template>
    <div class="window-frame-wrapper" :ref="name">
        <!-- prettier-ignore -->
        <window-frame-header>
            <p>
                <span>
                    <i class="far fa-window-close" @click="close" />
                </span>
            </p>
            창의 헤더
        </window-frame-header>
        <div class="window-frame-body">
            <slot name="content">
                <!-- 여기에 창 내용이 삽입됩니다 -->
            </slot>
        </div>
    </div>
</template>
<script>
import styled from "vue-styled-components";
import * as uuid from "uuid";

const WindowFrameHeader = styled.div`
    width: 256px;
    height: 240px;
    position: relative;
    left: 50%;
    display: flex;
    align-self: center;
    background-color: #007acc;
`;

export default {
    components: {
        WindowFrameHeader
    },
    props: {
        name: {
            type: String,
            default: "Window"
        }
    },
    mounted() {
        const refName = this.name;
        $(this.$refs[refName]).draggable();
    },
    data() {
        return {
            title: "",
            isActive: true
        };
    },
    methods: {
        close() {
            this.$router.push("home");
        }
    }
};
</script>
<style lang="scss"></style>
