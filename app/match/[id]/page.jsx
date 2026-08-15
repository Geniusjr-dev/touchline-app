import MatchCentre from "@/components/MatchCentre";
export const dynamic = "force-dynamic";
export default function Page({ params }) {
  return <MatchCentre id={params.id} />;
}
