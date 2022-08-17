import { IconItem } from "@components/atomics/IconItem";
import { Label } from "@components/atomics/Label";
import { ListContainer } from "@components/atomics/ListContainer";
import { ListItem } from "@components/atomics/ListItem";

export function TopDownNavigationMenu() {
  return (
    <ListContainer className="menu__main">
      <ListItem className="menu__main-program-icon"></ListItem>
      <ListItem className="menu__main-file">
        <Label htmlFor="file" data-action="file">
          File
        </Label>
      </ListItem>
      <ListItem>
        <Label htmlFor="edit" data-action="edit">
          Edit
        </Label>
      </ListItem>
      <ListItem>
        <Label htmlFor="mode" data-action="mode">
          Mode
        </Label>
      </ListItem>
      <ListItem>
        <Label htmlFor="draw" data-action="draw">
          Draw
        </Label>
      </ListItem>
      <ListItem>
        <Label htmlFor="scale" data-action="scale">
          Scale
        </Label>
      </ListItem>
      <ListItem>
        <Label htmlFor="tools" data-action="tools">
          Tools
        </Label>
      </ListItem>
      <ListItem>
        <Label htmlFor="game" data-action="game">
          Game
        </Label>
      </ListItem>
      <ListItem>
        <Label htmlFor="help" data-action="help">
          Help
        </Label>
      </ListItem>
      <ListContainer className="control-box">
        <ListItem className="minimum" data-action="minimum">
          <IconItem className="fas fa-minus"></IconItem>
        </ListItem>
        <ListItem className="maximum" data-action="maximum">
          <IconItem className="fas fa-window-maximize"></IconItem>
        </ListItem>
        <ListItem className="close" data-action="close">
          <IconItem className="far fa-window-close"></IconItem>
        </ListItem>
      </ListContainer>
    </ListContainer>
  );
}
