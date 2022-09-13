import Container, { Service } from "typedi";
import { IBaseMenuCommand } from "./commands/IBaseMenuCommand";

export type MenuCommandTarget = {
  target: IBaseMenuCommand;
  menuId: string;
  name: string;
  description: string;
  shortcut: string[];
};

export interface MenuAction {
  name: string;
  token: string;
  action<T = any>(ev: T): void;
}

@Service()
export class MetadataStorage {
  menuCommands: MenuCommandTarget[] = [];
  menuActions: MenuAction[] = [];
}

export function getMetadataStorage() {
  return Container.get(MetadataStorage);
}
