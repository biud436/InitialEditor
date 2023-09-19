import React from 'react';
import { Box } from './atomics/Box';
import { MyReactNodeProps } from './MainContainer';

export function Container({ children }: MyReactNodeProps) {
    return <Box id="container">{children}</Box>;
}
