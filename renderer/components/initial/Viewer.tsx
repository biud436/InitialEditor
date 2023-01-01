import React from "react";

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
