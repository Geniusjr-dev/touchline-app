import "./globals.css";
import Providers from "@/components/Providers";

export const metadata = {
  title: "Touchline: grassroots live scores",
  description: "Live scores, fixtures and tables for grassroots football tournaments.",
  applicationName: "Touchline",
  appleWebApp: {
    capable: true,
    title: "Touchline",
    statusBarStyle: "black-translucent",
  },
};

export const viewport = {
  themeColor: "#090A0B",
};

export default function RootLayout({ children }) {
  return (
    <html lang="en">
      <body>
        <Providers>{children}</Providers>
      </body>
    </html>
  );
}
