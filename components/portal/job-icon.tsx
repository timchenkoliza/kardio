import { BookOpenCheck, CalendarDays, FolderOpen, GraduationCap, Pill, Scale, Search, Sparkles } from "lucide-react";
import type { PortalJobDefinition } from "@/lib/portal/jobs";

const ICONS = { answer: BookOpenCheck, pill: Pill, scale: Scale, search: Search, calendar: CalendarDays, graduation: GraduationCap, sparkles: Sparkles, folder: FolderOpen } as const;

export function JobIcon({ icon, size = 18 }: { icon: PortalJobDefinition["icon"]; size?: number }) {
  const Icon = ICONS[icon];
  return <Icon size={size} aria-hidden="true" />;
}
