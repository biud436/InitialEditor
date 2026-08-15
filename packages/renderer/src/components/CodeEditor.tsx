import AceEditor from 'react-ace';
import 'ace-builds/src-noconflict/mode-lua';
import 'ace-builds/src-noconflict/theme-github';
import 'ace-builds/src-noconflict/theme-tomorrow_night';
import 'ace-builds/src-noconflict/ext-language_tools';
import styled from 'styled-components';

const Wrapper = styled.div`
  width: 100%;
  height: 100%;
  min-height: 0;
`;

export interface CodeEditorProps {
  value: string;
  onChange?: (value: string) => void;
  /** Ctrl+S / Cmd+S (Ace 가 포커스를 가진 상태에서도 잡는다) */
  onSave?: () => void;
  readOnly?: boolean;
  theme?: 'github' | 'tomorrow_night';
  name?: string;
}

const CodeEditor = ({
  value,
  onChange,
  onSave,
  readOnly = false,
  theme = 'tomorrow_night',
  name = 'lua-editor',
}: CodeEditorProps) => {
  return (
    <Wrapper>
      <AceEditor
        mode={'lua'}
        theme={theme}
        name={name}
        width="100%"
        height="100%"
        fontSize={14}
        highlightActiveLine={true}
        value={value}
        readOnly={readOnly}
        onChange={onChange}
        commands={[
          {
            name: 'save',
            bindKey: { win: 'Ctrl-S', mac: 'Command-S' },
            exec: () => onSave?.(),
          },
        ]}
        setOptions={{
          enableBasicAutocompletion: true,
          enableLiveAutocompletion: true,
          enableSnippets: true,
          showLineNumbers: true,
          tabSize: 4,
          useSoftTabs: true,
        }}
        editorProps={{ $blockScrolling: Infinity }}
      />
    </Wrapper>
  );
};

export default CodeEditor;
