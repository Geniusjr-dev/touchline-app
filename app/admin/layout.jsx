import { AuthProvider } from "@/components/AuthProvider";
import AdminPortalShell from "@/components/admin/AdminPortalShell";

export const metadata = {
  title: "Touchline Admin",
  description: "Protected Touchline competition administration portal.",
  robots: {
    index: false,
    follow: false,
    nocache: true,
    googleBot: {
      index: false,
      follow: false,
      noimageindex: true,
    },
  },
};

export default function AdminLayout({ children }) {
  return (
    <AuthProvider>
      <AdminPortalShell>{children}</AdminPortalShell>
    </AuthProvider>
  );
}
