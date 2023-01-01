import dynamic from "next/dynamic";

export const InitialEditorViewer = dynamic(() => import("./Viewer"), {
    ssr: false,
});
