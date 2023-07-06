import { Division } from "@components/atomics/Wrapper";
import React from "react";
import styled from "styled-components";

interface ContainerWrapperProps {
    children: React.ReactNode[];
}

export function ContainerWrapper({ children }: ContainerWrapperProps) {
    return (
        <Division id="tilesetWindow" window-name="타일셋 창">
            {children}
        </Division>
    );
}
