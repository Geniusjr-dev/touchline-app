import TeamAdminDetail from "@/components/admin/TeamAdminDetail";

export default async function Page({ params }) {
  const { id } = await params;
  return <TeamAdminDetail id={id} />;
}
