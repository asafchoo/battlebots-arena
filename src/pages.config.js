import BracketOverlay from './pages/BracketOverlay';
import CountdownOverlay from './pages/CountdownOverlay';
import Home from './pages/Home';
import __Layout from './Layout.jsx';


export const PAGES = {
    "BracketOverlay": BracketOverlay,
    "CountdownOverlay": CountdownOverlay,
    "Home": Home,
}

export const pagesConfig = {
    mainPage: "Home",
    Pages: PAGES,
    Layout: __Layout,
};