import { useMemo, useState } from "react";
import { useClose as useClose } from "../../providers/window.providers";
import { BaseWindowFrame } from "./BaseWindowFrame";
import styled from "styled-components";
import { Division } from "@components/atomics/Wrapper";
import { ListContainer } from "@components/atomics/ListContainer";
import { ListItem } from "@components/atomics/ListItem";
import { Button } from "@components/atomics/Button";
import { Paragraph } from "@components/atomics/Paragraph";
import { Label } from "@components/atomics/Label";
import { Input } from "@components/atomics/Input";
import { Span } from "@components/atomics/Span";
import { IconItem } from "@components/atomics/IconItem";

export type Project = {
  path: FileList;
  author: string;
};

export type ReactWindowProps = { children: React.ReactNode };

export default function NewWindow({ children }: ReactWindowProps) {
  const { close } = useClose();
  const [gameName, setGameName] = useState("");
  const [, setFileName] = useState("");

  const windowRect = useMemo(() => {
    return {
      width: 256,
      height: 256,
    };
  }, []) as { width: number; height: number };

  const onChangeGameName = (e: React.ChangeEvent<HTMLInputElement>) => {
    setGameName(e.target.value);
  };

  const onChangeFileName = (e: React.ChangeEvent<HTMLInputElement>) => {
    setFileName(e.target.value);
  };

  return (
    <BaseWindowFrame props={windowRect}>
      <Division className="newContainer">
        <Division id="newWindow" window-name={"gameProperty"}>
          <ListContainer>
            <ListItem key="583334c93fe9fa509d811fc0b2928056_gameName">
              <Label htmlFor="name">{gameName}</Label>
              <Input
                type="text"
                placeholder="name"
                value={gameName}
                onChange={onChangeGameName}
              />
            </ListItem>
            <ListItem key="583334c93fe9fa509d811fc0b2928056_gameFile">
              <Label htmlFor="name">{"gameFile"}</Label>
              <Input
                type="file"
                placeholder=""
                multiple
                accept="directory"
                onChange={onChangeFileName}
              />
            </ListItem>
          </ListContainer>
          <Division className="newWindow__control-box">
            <Paragraph>
              <Span>
                <IconItem
                  className="far fa-window-close"
                  id="action-close"
                  onClick={close}
                ></IconItem>
              </Span>
            </Paragraph>
          </Division>
          <Division className="panel">
            <Button>
              <i className="fas fa-upload"></i>
              {"newGame"}
            </Button>
          </Division>
        </Division>
      </Division>
    </BaseWindowFrame>
  );
}
