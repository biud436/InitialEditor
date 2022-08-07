import { Division } from "@components/atomics/Wrapper";
import React from "react";

export function ContainerWrapper({
    children,
}: {
    children: React.ReactNode[];
}) {
    return (
        <Division id="tilesetWindow" window-name="타일셋 창">
            {children}
        </Division>
    );
}
