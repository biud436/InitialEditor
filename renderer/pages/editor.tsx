import dynamic from "next/dynamic";

const CodeEditor = dynamic(() => import("components/CodeEditor"), {
  ssr: false,
});

export default function CodeEditorPage() {
  return (
    <>
      <CodeEditor />
    </>
  );
}
