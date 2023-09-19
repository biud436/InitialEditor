import { Box } from '@components/atomics/Box';
import NewWindow from '@components/window/NewWindow';
import { WindowContext } from '@context/window.providers';
import { WindowState } from '@store/window';
import classnames from 'classnames';
import { useRecoilState } from 'recoil';

export const NewWindowStoryContainer = () => {
    const [, setPanel] = useRecoilState(WindowState);

    const close = () => {
        setPanel({
            currentWindow: 'none',
        });
    };

    return (
        <Box className={classnames('widget')}>
            <WindowContext.Provider value={{ close }}>
                <NewWindow />
            </WindowContext.Provider>
        </Box>
    );
};
