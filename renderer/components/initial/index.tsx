import dynamic from "next/dynamic";

export const Viewer = dynamic(() => import("./Viewer"), {
    ssr: false,
});
