/* eslint-disable @typescript-eslint/ban-ts-comment */
/* eslint-disable @typescript-eslint/ban-types */
import React from 'react';

export interface ViewerWrapperProps {
    callback: Function;
}

export default class ViewerWrapper extends React.Component<ViewerWrapperProps> {
    elem = React.createRef<HTMLDivElement>();

    componentDidMount() {
        const { callback } = this.props;
        // @ts-ignore
        import('../../public/js/initial-editor.js').then(() => {
            window.Main.start(callback);
        });
    }

    render() {
        return <div ref={this.elem} />;
    }
}
