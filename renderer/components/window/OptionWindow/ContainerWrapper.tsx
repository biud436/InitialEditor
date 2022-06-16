import React from "react";

export function ContainerWrapper({
    children,
}: {
    children: React.ReactNode[];
}) {
    return (
        <div id="tilesetWindow" window-name="타일셋 창">
            {children}
        </div>
    );
}
