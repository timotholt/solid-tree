import { expect, it } from "vitest";
import { render } from "@solidjs/testing-library";
import { isServer } from "solid-js/web";

it("runs Solid in a real browser with layout", () => {
  expect(isServer).toBe(false);
  const { container } = render(() => <div style={{ height: "40px" }}>hello</div>);
  expect(container.firstElementChild!.getBoundingClientRect().height).toBe(40);
});
