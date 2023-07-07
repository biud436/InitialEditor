import { Input } from "@components/atomics/Input";
import { Label } from "@components/atomics/Label";
import { ListContainer } from "@components/atomics/ListContainer";
import { ListItem } from "@components/atomics/ListItem";
import { Division } from "@components/atomics/Wrapper";
import classNames from "classnames";
import { styled } from "styled-components";

export function ContentHeader() {
    return (
        <ContentHeaderWrapper
            className={classNames(
                "tilesetWindow__tileset",
                "tilesetWindow__tab-border"
            )}
            tab-name="타일셋"
        >
            <ListContainer>
                <ListItem>
                    <Label htmlFor="name">이름: </Label>
                    <Input type="text" placeholder="name" name="name" />
                </ListItem>
            </ListContainer>
        </ContentHeaderWrapper>
    );
}

const ContentHeaderWrapper = styled(Division)`
    margin-top: 1rem;
`;
