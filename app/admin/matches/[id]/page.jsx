import ScheduledMatchEditor from "@/components/admin/ScheduledMatchEditor";

export default async function Page({ params }) {
  const { id } = await params;
  return <ScheduledMatchEditor id={id} />;
}
