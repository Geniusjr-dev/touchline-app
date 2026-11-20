import TeamCentre from "@/components/TeamCentre";

export const dynamic = "force-dynamic";

export default async function Page({ params, searchParams }) {
  const { id } = await params;
  const query = await searchParams;
  return <TeamCentre key={`${id}:${query?.tab === "squad"}`} id={id} initialTab={query?.tab === "squad" ? "Squad" : "Overview"} />;
}
