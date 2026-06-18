import { render } from "solid-js/web";
import { App } from "./App.jsx";
import { Spike } from "./Spike.jsx";

const spike = new URLSearchParams(location.search).has("spike");
render(() => (spike ? <Spike /> : <App />), document.getElementById("app")!);
