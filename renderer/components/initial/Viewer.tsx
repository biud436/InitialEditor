import React from "react";

export interface ViewerWrapperProps {
    callback: Function;
}

export default class ViewerWrapper extends React.Component<ViewerWrapperProps> {
    elem = React.createRef<HTMLDivElement>();

    componentDidMount() {
        const { callback } = this.props;
        import("../../static/js/initial-editor.js").then(() => {
            window.Main.start(callback);
            alert("시작되었습니다.");
        });
    }

    render() {
        return <div ref={this.elem} />;
    }
}
