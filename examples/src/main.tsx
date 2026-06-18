import { render } from "solid-js/web";
import { App } from "./App.jsx";
import { Spike } from "./Spike.jsx";
import { VirtualDemo } from "./VirtualDemo.jsx";
import { DatabaseDemo } from "./DatabaseDemo.jsx";
import { Nav } from "./Nav.jsx";

const p = new URLSearchParams(location.search);
const View = p.has("spike")
  ? Spike
  : p.has("virtual")
    ? VirtualDemo
    : p.has("database")
      ? DatabaseDemo
      : App;

render(
  () => (
    <>
      <Nav />
      <View />
    </>
  ),
  document.getElementById("app")!
);
