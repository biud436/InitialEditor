import { BrowserRouter } from "react-router-dom";
import { GlobalStyle } from "../styles/global-style";
import Home from "./home";

export function Routers() {
    return (
        <BrowserRouter basename="/">
            <GlobalStyle />
            <Home />
        </BrowserRouter>
    );
}
