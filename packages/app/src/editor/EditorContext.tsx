import { createContext, useContext } from "react";
import type { Editor } from "./Editor";

const EditorContext = createContext<Editor | null>(null);

export const EditorProvider = EditorContext.Provider;

export function useEditor(): Editor {
  const editor = useContext(EditorContext);
  if (!editor) throw new Error("EditorProvider 밖에서 useEditor 호출");
  return editor;
}
