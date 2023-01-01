import React from "react";
// import { Main } from "types/index.js";
// import { Main } from "types";
// import { Main } from "../../../packages/index";

export interface InitialEditorWrapperProps {
    callback: Function;
}

export default class InitialEditorWrapper extends React.Component<InitialEditorWrapperProps> {
    elem = React.createRef<HTMLDivElement>();

    componentDidMount() {
        import("../../static/js/initial-editor.js").then(() => {
            window.Main.start(this.props.callback);
        });
    }

    render() {
        return <div ref={this.elem} />;
    }
}
