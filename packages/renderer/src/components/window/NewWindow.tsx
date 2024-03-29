import { useMemo, useState } from 'react';
import { useClose as useClose } from '@hooks/useClose';
import { BaseWindowFrame } from './BaseWindowFrame';
import { useUUID } from '@hooks/useUUID';
import styled from 'styled-components';
import { Button } from '@components/atomics/Button';
import { CloseButton } from './CloseButton';

export type Project = {
    path: FileList;
    author: string;
};

export type HTMLInputEvent = React.ChangeEvent<HTMLInputElement>;
export interface WindowRect {
    width: number;
    height: number;
}

const ControlBox = styled.div`
    position: absolute;
    top: 0em;
    right: 0;
`;

export default function NewWindow() {
    const { close } = useClose();
    const [gameName, setGameName] = useState('');
    const [, setFileName] = useState('');
    const [listKeys] = useState<string[]>([
        useUUID('newWindow_gameFile')[1],
        useUUID('newWindow_selectFolder')[1],
    ]);

    const windowRect = useMemo(() => {
        return {
            width: 200,
            height: 150,
        };
    }, []) as WindowRect;

    const onChangeGameName = (e: HTMLInputEvent) => {
        setGameName(e.target.value);
    };

    const onChangeFileName = (e: HTMLInputEvent) => {
        setFileName(e.target.value);
    };

    return (
        <BaseWindowFrame props={windowRect}>
            <div className="newContainer">
                <div id="newWindow" window-name={'새로운 프로젝트 생성'}>
                    <ul>
                        <li key={listKeys[0]} className="title">
                            <label htmlFor="name">게임 이름</label>
                            <input
                                type="text"
                                placeholder="게임 이름을 입력하세요."
                                value={gameName}
                                onChange={onChangeGameName}
                            />
                        </li>
                        <li key={listKeys[1]}>
                            <label htmlFor="name">폴더 선택</label>
                            <input
                                type="file"
                                placeholder=""
                                accept="directory"
                                onChange={onChangeFileName}
                            />
                        </li>
                    </ul>
                    <ControlBox>
                        <CloseButton />
                    </ControlBox>
                    <div className="panel">
                        <Button>
                            <i className="fas fa-upload"></i>
                            프로젝트 생성하기
                        </Button>
                        <Button onClick={close}>취소</Button>
                    </div>
                </div>
            </div>
        </BaseWindowFrame>
    );
}
