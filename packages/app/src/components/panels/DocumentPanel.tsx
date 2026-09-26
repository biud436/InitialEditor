// 가운데 문서 탭의 본문. 문서 종류에 따라 뷰를 고르고, 밖에서 바뀐 문서에는 배너를 얹는다.

import type { IDockviewPanelProps } from "dockview";
import { observer } from "mobx-react-lite";
import type { DocumentPanelParams } from "../../editor/documentDock";
import { ImagePreviewDocument } from "../../editor/documents/ImagePreviewDocument";
import { TextPreviewDocument } from "../../editor/documents/TextPreviewDocument";
import { WelcomeDocument } from "../../editor/documents/WelcomeDocument";
import { useEditor } from "../../editor/EditorContext";
import { ExternalChangeBanner } from "../documents/ExternalChangeBanner";
import { ImagePreviewView } from "../documents/ImagePreviewView";
import { TextPreviewView } from "../documents/TextPreviewView";
import { WelcomeView } from "../documents/WelcomeView";

export const DocumentPanel = observer(function DocumentPanel(props: IDockviewPanelProps<DocumentPanelParams>) {
  const editor = useEditor();
  const doc = editor.documentDock.findDocument(props.api.id);
  if (!doc) {
    return <div className="panel-hint">문서를 여는 중이다: {props.params?.path ?? props.api.id}</div>;
  }
  let view;
  if (doc instanceof WelcomeDocument) view = <WelcomeView />;
  else if (doc instanceof TextPreviewDocument) view = <TextPreviewView doc={doc} />;
  else if (doc instanceof ImagePreviewDocument) view = <ImagePreviewView doc={doc} />;
  else view = <div className="panel-hint">이 문서 종류를 그릴 수 없다: {doc.kind}</div>;
  return (
    <div className="document" data-testid="document" data-kind={doc.kind}>
      {doc.externallyChanged && <ExternalChangeBanner doc={doc} />}
      <div className="document-body">{view}</div>
    </div>
  );
});
