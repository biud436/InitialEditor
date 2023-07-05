import AceEditor from "react-ace";

import "ace-builds/src-noconflict/mode-lua";
import "ace-builds/src-noconflict/theme-github";
import "ace-builds/src-noconflict/ext-language_tools";

const CodeEditor = () => {
    return (
        <div>
            <AceEditor
                mode={"lua"}
                theme={"github"}
                name={"blah2"}
                fontSize={14}
                highlightActiveLine={true}
                value={""}
                setOptions={{
                    enableBasicAutocompletion: true,
                    enableLiveAutocompletion: true,
                    enableSnippets: true,
                    showLineNumbers: true,
                }}
            />
        </div>
    );
};

export default CodeEditor;
