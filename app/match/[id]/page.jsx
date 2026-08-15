import MatchCentre from "@/components/MatchCentre";
export const dynamic = "force-dynamic";
export default async function Page({ params }) {
  const { id } = await params;
  return <MatchCentre id={id} />;
}
