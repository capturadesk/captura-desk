import React from "react";
import ReactDOM from "react-dom/client";
import App from "./App";
import "./index.css";
import { RecorderToolbar } from "./components/recorder-toolbar";

ReactDOM.createRoot(document.getElementById("root")!).render(
  <React.StrictMode>
    {location.hash === "#recorder" ? <RecorderToolbar /> : <App />}
  </React.StrictMode>,
);
