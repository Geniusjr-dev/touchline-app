import "./globals.css";
import Providers from "@/components/Providers";

export const metadata = {
  title: "Touchline — grassroots live scores",
  description: "Live scores, fixtures and tables for grassroots football tournaments.",
};

export default function RootLayout({ children }) {
  return (
    <html lang="en">
      <body style={{ fontFamily: "ui-sans-serif, system-ui, -apple-system, sans-serif" }}>
        <Providers>{children}</Providers>
      </body>
    </html>
  );
}
