export function TileSelectWindow() {
    return (
        <div id="aside">
            <div className="aside__tabs">
                <div id="view" onDragStart={() => false}></div>

                <input type="radio" name="tile" id="a" defaultChecked />
                <input type="radio" name="tile" id="b" />
                <input type="radio" name="tile" id="c" />
                <input type="radio" name="tile" id="d" />
                <input type="radio" name="tile" id="e" />
                <ul>
                    <li>
                        <label htmlFor="a" id="tab-a" data-action="tab1">
                            A
                        </label>
                    </li>
                    <li>
                        <label htmlFor="b" id="tab-b" data-action="tab2">
                            B
                        </label>
                    </li>
                    <li>
                        <label htmlFor="c" id="tab-c" data-action="tab3">
                            C
                        </label>
                    </li>
                    <li>
                        <label htmlFor="d" id="tab-d" data-action="tab4">
                            D
                        </label>
                    </li>
                    <li>
                        <label htmlFor="e" id="tab-e" data-action="tab5">
                            E
                        </label>
                    </li>
                </ul>
                <div className="aside__tabs__maptree">
                    <ul>
                        <li>
                            <i className="fas fa-folder"></i>레이어 그룹
                            <ul className="aside__tabs__maptree-child-tree">
                                <li data-action="layer1">
                                    <i className="far fa-eye"></i>레이어 1
                                </li>
                                <li data-action="layer2">
                                    <i className="far fa-eye"></i>레이어 2
                                </li>
                                <li data-action="layer3">
                                    <i className="far fa-eye"></i>레이어 3
                                </li>
                                <li data-action="layer4">
                                    <i className="far fa-eye"></i>레이어 4
                                </li>
                            </ul>
                        </li>
                    </ul>
                </div>
            </div>
        </div>
    );
}
