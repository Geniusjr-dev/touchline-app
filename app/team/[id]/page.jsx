import TeamCentre from "@/components/TeamCentre";

export const dynamic = "force-dynamic";

export default async function Page({ params }) {
  const { id } = await params;
  return <TeamCentre id={id} />;
}
