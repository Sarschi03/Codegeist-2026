import { createRoot } from "react-dom/client";
import "@fontsource-variable/inter";
import "@excalidraw/excalidraw/index.css";
import "./styles/app.css";
import { App } from "./App";
(window as Window & { EXCALIDRAW_ASSET_PATH?: string }).EXCALIDRAW_ASSET_PATH =
  new URL("./excalidraw-assets/", location.href).href;
createRoot(document.getElementById("root")!).render(<App />);
