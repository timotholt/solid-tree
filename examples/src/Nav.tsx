import { type Component } from "solid-js";

const links: { href: string; label: string; match: (s: URLSearchParams) => boolean }[] = [
  { href: "/", label: "Gallery (<Tree>)", match: (s) => !["virtual", "database", "spike", "supabase", "controller", "json", "github", "outline"].some((k) => s.has(k)) },
  { href: "/?virtual", label: "<VirtualTree>", match: (s) => s.has("virtual") },
  { href: "/?json", label: "JSON Explorer", match: (s) => s.has("json") },
  { href: "/?database", label: "<DatabaseTree>", match: (s) => s.has("database") && !s.has("database2") },
  { href: "/?github", label: "GitHub browser", match: (s) => s.has("github") },
  { href: "/?database2", label: "Collaborative", match: (s) => s.has("database2") },
  { href: "/?supabase", label: "<SupabaseTree>", match: (s) => s.has("supabase") },
  { href: "/?outline", label: "Collab outline", match: (s) => s.has("outline") },
  { href: "/?controller", label: "Controller API", match: (s) => s.has("controller") },
  { href: "/?spike", label: "solid-virtual spike", match: (s) => s.has("spike") },
];

export const Nav: Component = () => {
  const params = new URLSearchParams(location.search);
  return (
    <nav class="demo-nav">
      <strong>@timotholt/solid-tree</strong>
      <span style="flex:1" />
      {links.map((l) => (
        <a href={l.href} classList={{ active: l.match(params) }}>
          {l.label}
        </a>
      ))}
    </nav>
  );
};
