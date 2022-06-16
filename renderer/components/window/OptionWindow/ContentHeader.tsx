export function ContentHeader() {
    return (
        <div
            className="tilesetWindow__tileset tilesetWindow__tab-border"
            tab-name="타일셋"
        >
            <ul>
                <li>
                    <label htmlFor="name">이름: </label>
                    <input type="text" placeholder="name" name="name" />
                </li>
                <li>
                    <label htmlFor="name">이미지: </label>
                    <input type="file" name="" id="image-load-dialog" />
                </li>
            </ul>
        </div>
    );
}
