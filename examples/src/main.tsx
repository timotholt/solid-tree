import { render } from "solid-js/web";
import { App } from "./App.jsx";
import { Spike } from "./Spike.jsx";
import { VirtualDemo } from "./VirtualDemo.jsx";
import { DatabaseDemo } from "./DatabaseDemo.jsx";
import { DatabaseDemo2 } from "./DatabaseDemo2.jsx";
import { SupabaseDemo } from "./SupabaseDemo.jsx";
import { ControllerDemo } from "./ControllerDemo.jsx";
import { JsonDemo } from "./JsonDemo.jsx";
import { GithubDemo } from "./GithubDemo.jsx";
import { OutlineDemo } from "./OutlineDemo.jsx";
import { Nav } from "./Nav.jsx";

const p = new URLSearchParams(location.search);
const View = p.has("spike")
  ? Spike
  : p.has("outline")
    ? OutlineDemo
    : p.has("json")
      ? JsonDemo
      : p.has("github")
        ? GithubDemo
      : p.has("controller")
        ? ControllerDemo
        : p.has("virtual")
          ? VirtualDemo
          : p.has("supabase")
            ? SupabaseDemo
            : p.has("database2")
              ? DatabaseDemo2
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
