import starlight from "@astrojs/starlight";
import { defineConfig } from "astro/config";

export default defineConfig({
  site: "https://sillyfrogster.github.io",
  base: "/Eunia",
  integrations: [
    starlight({
      title: "Eunia",
      description: "A typed Discord library built for Bun.",
      logo: {
        src: "./src/assets/eunia.svg",
      },
      favicon: "/favicon.svg",
      customCss: [
        "@fontsource-variable/onest",
        "./src/styles/global.css",
      ],
      social: [
        {
          icon: "github",
          label: "GitHub",
          href: "https://github.com/Sillyfrogster/Eunia",
        },
        {
          icon: "discord",
          label: "Discord",
          href: "https://discord.gg/WuPqrRtYHX",
        },
      ],
      editLink: {
        baseUrl: "https://github.com/Sillyfrogster/Eunia/edit/main/docs/",
      },
      lastUpdated: true,
      sidebar: [
        { label: "Home", slug: "index" },
        {
          label: "Start here",
          items: [
            { label: "Getting started", slug: "getting-started" },
          ],
        },
        {
          label: "Guides",
          items: [
            { label: "Commands", slug: "guides/commands" },
            { label: "Caching", slug: "guides/cache" },
            { label: "Modules", slug: "guides/modules" },
          ],
        },
        {
          label: "Reference",
          items: [
            { label: "Feature coverage", slug: "reference/coverage" },
            { label: "Packages", slug: "reference/packages" },
          ],
        },
        {
          label: "API reference",
          collapsed: true,
          items: [
            { label: "Overview", slug: "reference/api" },
            { label: "Client", slug: "reference/api/client" },
            { label: "Commands", slug: "reference/api/commands" },
            { label: "Structures", slug: "reference/api/structures" },
            { label: "Cache", slug: "reference/api/cache" },
            { label: "Gateway", slug: "reference/api/gateway" },
            { label: "REST", slug: "reference/api/rest" },
            { label: "Helpers", slug: "reference/api/helpers" },
            { label: "Logging", slug: "reference/api/logging" },
            { label: "Discord types", slug: "reference/api/types" },
          ],
        },
        {
          label: "Examples",
          items: [{ label: "Example bots", slug: "examples" }],
        },
      ],
    }),
  ],
});
