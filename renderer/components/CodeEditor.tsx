import Editor, { DiffEditor, useMonaco, loader } from "@monaco-editor/react";
import { useEffect } from "react";

const CodeEditor = () => {
    useEffect(() => {
        loader.config({
            paths: {
                vs: "https:/cdn.jsdelivr.net/npm/monaco-editor@0.33.0/min/vs",
            },
        });
    }, []);

    return <Editor defaultLanguage="javascript" />;
};

export default CodeEditor;
