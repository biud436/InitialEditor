import { BrowserRouter } from "react-router-dom";
import { GlobalStyle } from "../styles/global-style";

export function Routers() {
    return (
        <BrowserRouter basename="/">
            <GlobalStyle />
            <div>오우..........</div>
        </BrowserRouter>
    );
}
