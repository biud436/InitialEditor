import React from "react";

export interface InitialEditorWrapperProps {
    callback: Function;
}

export default class InitialEditorWrapper extends React.Component<InitialEditorWrapperProps> {
    elem = React.createRef<HTMLDivElement>();

    componentDidMount() {
        const { callback } = this.props;
        import("../../static/js/initial-editor.js").then(() => {
            window.Main.start(callback);
        });
    }

    render() {
        return <div ref={this.elem} />;
    }
}
