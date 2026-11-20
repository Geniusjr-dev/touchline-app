import LeagueCentre from "@/components/LeagueCentre";

export const dynamic = "force-dynamic";

export default async function Page({ params, searchParams }) {
  const { id } = await params;
  const query = await searchParams;
  return <LeagueCentre key={id} id={id} tournamentView={query?.view === "knockout" ? "Knockout" : undefined}
    tournamentEdition={typeof query?.edition === "string" ? query.edition : undefined} />;
}
