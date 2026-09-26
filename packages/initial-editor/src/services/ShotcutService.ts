import Mousetrap, { MousetrapInstance } from "mousetrap";
import Container, { Service } from "typedi";

@Service()
export class ShotcutService {
    private mousetrap: MousetrapInstance;

    constructor() {
        this.mousetrap = new Mousetrap();
    }

    /**
     * 콜백이 false 를 돌려주면 Mousetrap 이 브라우저 기본 동작을 막는다 (preventDefault).
     */
    public bindEx(
        key: string,
        callback: (ev?: unknown, combo?: string) => boolean | void,
    ) {
        this.mousetrap.bind(key, callback as unknown as Parameters<MousetrapInstance["bind"]>[1]);
    }
}

export function getShotcutService() {
    return Container.get(ShotcutService);
}
