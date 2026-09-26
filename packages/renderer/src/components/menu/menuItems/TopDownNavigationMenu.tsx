export function TopDownNavigationMenu() {
  return (
    <ul id="menu__main" className={`menu__main`}>
      <li className="menu__main-program-icon" />
      <li className="menu__main-file">
        <label htmlFor="file" data-action="file">
          File
        </label>
      </li>
      <li className="menu__main-edit">
        <label htmlFor="edit" data-action="edit">
          Edit
        </label>
      </li>
      <li className="menu__main-mode">
        <label htmlFor="mode" data-action="mode">
          Mode
        </label>
      </li>
      <li className="menu__main-draw">
        <label htmlFor="draw" data-action="draw">
          Draw
        </label>
      </li>
      <li className="menu__main-scale">
        <label htmlFor="scale" data-action="scale">
          Scale
        </label>
      </li>
      <li className="menu__main-tools">
        <label htmlFor="tools" data-action="tools">
          Tools
        </label>
      </li>
      <li className="menu__main-game">
        <label htmlFor="game" data-action="game">
          Game
        </label>
      </li>
      <li className="menu__main-help">
        <label htmlFor="help" data-action="help">
          Help
        </label>
      </li>
      <ul className="control-box">
        <li className="minimum" data-action="minimum">
          <i className="fas fa-minus"></i>
        </li>
        <li className="maximum" data-action="maximum">
          <i className="fas fa-window-maximize"></i>
        </li>
        <li className="close" data-action="close">
          <i className="far fa-window-close"></i>
        </li>
      </ul>
    </ul>
  );
}
