import { BookOpenCheck, CalendarDays, FolderOpen, GraduationCap, Pill, Scale, Search, Sparkles } from "lucide-react";
import type { AgentDefinition } from "@/lib/agents/types";

const ICONS = { sparkles: Sparkles, scale: Scale, pill: Pill, search: Search, calendar: CalendarDays, graduation: GraduationCap, folder: FolderOpen, answer: BookOpenCheck } as const;

export function AgentIcon({ icon, size = 20 }: { icon: AgentDefinition["icon"]; size?: number }) {
  const Icon = ICONS[icon];
  return <Icon size={size} aria-hidden="true" />;
}
