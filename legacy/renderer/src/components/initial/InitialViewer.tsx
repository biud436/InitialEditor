/* eslint-disable @typescript-eslint/ban-ts-comment */
/* eslint-disable @typescript-eslint/ban-types */
import React from 'react';
import "reflect-metadata";
import * as editor from "initial-editor";

export interface ViewerWrapperProps {
  callback: Function;
}


export default class InitialViewerWrapper extends React.Component<ViewerWrapperProps> {
  elem = React.createRef<HTMLDivElement>();
  main = React.createRef<editor.Main>();

  componentDidMount() {
    const { callback } = this.props;
    // @ts-ignore
    // import('../../public/js/initial-editor.js').then(() => {
    //   window.Main.start(callback);
    // });

    this.main.current = editor.Main;

    setTimeout(() => {
      // @ts-ignore
      this.main.current.start(callback);
    }, 10);
  }

  render() {
    return <div ref={this.elem} />;
  }
}
