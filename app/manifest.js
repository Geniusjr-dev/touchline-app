export default function manifest() {
  return {
    name: "Touchline",
    short_name: "Touchline",
    description: "Grassroots football live scores, fixtures and match alerts.",
    start_url: "/",
    display: "standalone",
    background_color: "#090A0B",
    theme_color: "#090A0B",
    icons: [
      {
        src: "/touchline-icon.svg",
        sizes: "any",
        type: "image/svg+xml",
        purpose: "any maskable",
      },
    ],
  };
}
