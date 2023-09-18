import { WindowContext } from '@context/window.providers';
import { useContext } from 'react';

/**
 * 창을 닫을 수 있습니다.
 */

export const useClose = () => {
    return useContext(WindowContext);
};
