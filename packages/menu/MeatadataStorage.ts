import Container, { Service } from "typedi";
import { IBaseMenuCommand } from "./commands/IBaseMenuCommand";

export type MenuCommandTarget = {
  target: IBaseMenuCommand;
  menuId: string;
  name: string;
  description: string;
  shortcut: string[];
};

@Service()
export class MetadataStorage {
  menuCommands: MenuCommandTarget[] = [];
}
