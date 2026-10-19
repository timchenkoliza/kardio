import { notFound } from "next/navigation";
import { AgentFirstWorkspace } from "@/components/agent-first-workspace";
import { isSpecialty } from "@/lib/specialty";

export const dynamic = "force-dynamic";

export default async function SpecialtyHome({
  params,
}: {
  params: Promise<{ specialty: string }>;
}) {
  const { specialty: rawSpecialty } = await params;
  if (!isSpecialty(rawSpecialty)) notFound();
  return <AgentFirstWorkspace specialty={rawSpecialty} />;
}
