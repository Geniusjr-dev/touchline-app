"use client";

import MatchCentre from "@/components/MatchCentre";
import { useParams } from "next/navigation";

export default function Page() {
  const { id } = useParams();
  return <MatchCentre id={id} />;
}
