import { createRoot } from "react-dom/client";
import { GeistSans } from "geist/font/sans";
import { GeistMono } from "geist/font/mono";
import App from "./App.tsx";
import "./index.css";

document.documentElement.classList.add("dark");
// Wire Geist into the CSS variables consumed by index.css.
document.documentElement.style.setProperty("--font-sans", GeistSans.style.fontFamily);
document.documentElement.style.setProperty("--font-mono", GeistMono.style.fontFamily);

createRoot(document.getElementById("root")!).render(<App />);
