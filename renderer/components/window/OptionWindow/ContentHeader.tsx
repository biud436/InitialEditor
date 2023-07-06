import { Input } from "@components/atomics/Input";
import { Label } from "@components/atomics/Label";
import { ListContainer } from "@components/atomics/ListContainer";
import { ListItem } from "@components/atomics/ListItem";
import { Division } from "@components/atomics/Wrapper";
import classNames from "classnames";

export function ContentHeader() {
    return (
        <Division
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
        </Division>
    );
}
