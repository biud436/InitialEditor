import Mousetrap, { MousetrapInstance } from "mousetrap";
import Container, { Service } from "typedi";

@Service()
export class ShotcutService {
    private mousetrap: MousetrapInstance;

    constructor() {
        this.mousetrap = new Mousetrap();
    }

    public bind(key: string, callback: () => void) {
        this.mousetrap.bind(key, callback);
    }
}

export function getShotcutService() {
    return Container.get(ShotcutService);
}
