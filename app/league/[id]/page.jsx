import LeagueCentre from "@/components/LeagueCentre";

export const dynamic = "force-dynamic";

export default async function Page({ params }) {
  const { id } = await params;
  return <LeagueCentre id={id} />;
}
