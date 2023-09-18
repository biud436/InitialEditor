import { BrowserRouter, Route, Routes } from "react-router-dom";
import { GlobalStyle } from "../styles/global-style";
import Home from "./home";
import { URL_MAP } from "common/URL";

export function Routers() {
    return (
        <BrowserRouter basename="/">
            <GlobalStyle />
            <Routes>
                <Route path={URL_MAP.MAIN} element={<Home />} />
            </Routes>
        </BrowserRouter>
    );
}
