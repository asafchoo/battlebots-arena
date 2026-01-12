import Home from './pages/Home';
import BracketOverlay from './pages/BracketOverlay';
import CountdownOverlay from './pages/CountdownOverlay';
import __Layout from './Layout.jsx';


export const PAGES = {
    "Home": Home,
    "BracketOverlay": BracketOverlay,
    "CountdownOverlay": CountdownOverlay,
}

export const pagesConfig = {
    mainPage: "Home",
    Pages: PAGES,
    Layout: __Layout,
};