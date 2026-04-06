import ReactDOM from "react-dom/client";
import "antd/dist/reset.css";
import { App } from "./app";
import "./styles/base.css";
import "./styles/tokens.css";
import "./styles/layout.css";
import "./styles/dashboard.css";

ReactDOM.createRoot(document.getElementById("app") as HTMLElement).render(<App />);
