import { MovieBridge } from "./MovieBridge";
import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import App from "./App";
import "./styles.css";

createRoot(document.getElementById("root")!).render(<StrictMode>{new URLSearchParams(location.search).get("movie") === "1" ? <MovieBridge /> : <App />}</StrictMode>);

