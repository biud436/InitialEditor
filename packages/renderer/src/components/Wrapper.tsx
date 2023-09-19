import { Box } from './atomics/Box';
import { MyReactNodeProps } from './MainContainer';

export function Wrapper({ children }: MyReactNodeProps) {
    return <Box id="wrapper">{children}</Box>;
}
