import { Box } from '@components/atomics/Box';
import { observer } from 'mobx-react';
import { uiStore } from '../../store/UIStore';

/**
 * 이 컴포넌트는 윈도우 타이틀 바를 구성합니다.
 */
export const WindowTitleBar = observer(() => {
    return (
        <Box
            className="drag-zon"
            window-name={uiStore.windowTitleBarName}
        ></Box>
    );
});
