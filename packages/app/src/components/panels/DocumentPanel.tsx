// 가운데 문서 탭의 본문. 문서 종류에 따라 뷰를 고르고, 밖에서 바뀐 문서에는 배너를 얹는다.

import { GraphDocument, SceneDocument } from "@initial-editor/core";
import { MapDocument } from "@initial-editor/ext-tilemap/model";
import type { IDockviewPanelProps } from "dockview";
import { observer } from "mobx-react-lite";
import type { DocumentPanelParams } from "../../editor/documentDock";
import { ImagePreviewDocument } from "../../editor/documents/ImagePreviewDocument";
import { ScriptDocument } from "../../editor/documents/ScriptDocument";
import { WelcomeDocument } from "../../editor/documents/WelcomeDocument";
import { useEditor } from "../../editor/EditorContext";
import { GameDocument } from "../../editor/gameView/GameDocument";
import { ExternalChangeBanner } from "../documents/ExternalChangeBanner";
import { GraphView } from "../graph/GraphView";
import { MapView } from "../maps/MapView";
import { GameView } from "../documents/GameView";
import { ImagePreviewView } from "../documents/ImagePreviewView";
import { SceneView } from "../documents/SceneView";
import { ScriptEditorView } from "../documents/ScriptEditorView";
import { WelcomeView } from "../documents/WelcomeView";

export const DocumentPanel = observer(function DocumentPanel(props: IDockviewPanelProps<DocumentPanelParams>) {
  const editor = useEditor();
  const doc = editor.documentDock.findDocument(props.api.id);
  if (!doc) {
    return <div className="panel-hint">문서 여는 중: {props.params?.path ?? props.api.id}</div>;
  }
  let view;
  if (doc instanceof WelcomeDocument) view = <WelcomeView />;
  else if (doc instanceof ScriptDocument) view = <ScriptEditorView doc={doc} />;
  else if (doc instanceof ImagePreviewDocument) view = <ImagePreviewView doc={doc} />;
  else if (doc instanceof SceneDocument) view = <SceneView document={doc} />;
  else if (doc instanceof MapDocument) view = <MapView document={doc} />;
  else if (doc instanceof GraphDocument) view = <GraphView doc={doc} />;
  else if (doc instanceof GameDocument) view = <GameView doc={doc} />;
  else view = <div className="panel-hint">지원하지 않는 문서 종류: {doc.kind}</div>;
  return (
    <div className="document" data-testid="document" data-kind={doc.kind}>
      {doc.externallyChanged && <ExternalChangeBanner doc={doc} />}
      <div className="document-body">{view}</div>
    </div>
  );
});
