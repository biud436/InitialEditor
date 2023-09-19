import { ListContainer } from '@components/atomics/ListContainer';
import { ListItem } from '@components/atomics/ListItem';
import { Box } from '@components/atomics/Box';
import classNames from 'classnames';
import { styled } from 'styled-components';

const ContentHeaderWrapper = styled(Box)`
    margin-top: 0rem;
`;

export function ContentHeader() {
    return (
        <ContentHeaderWrapper
            className={classNames(
                'tilesetWindow__tileset',
                'tilesetWindow__tab-border',
            )}
            tab-name="타일셋"
        >
            <ListContainer>
                <ListItem></ListItem>
            </ListContainer>
        </ContentHeaderWrapper>
    );
}
