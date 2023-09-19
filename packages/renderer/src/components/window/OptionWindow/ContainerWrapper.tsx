import { Box } from '@components/atomics/Box';
import React from 'react';

interface ContainerWrapperProps {
    children: React.ReactNode[];
}

export function ContainerWrapper({ children }: ContainerWrapperProps) {
    return (
        <Box id="tilesetWindow" window-name="타일셋 창">
            {children}
        </Box>
    );
}
