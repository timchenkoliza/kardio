import { cookies } from "next/headers";
import type { SpecialtyId } from "@/lib/domain/types";
import { SESSION_COOKIE } from "@/server/services/state";
import { restoreFromMirror } from "./store";
import { PROFILE_MIRROR_COOKIE } from "./store/mirror";

/** Server components read the anonymous session (never create it). */
export async function pageSession(specialty: SpecialtyId): Promise<string | null> {
  const jar = await cookies();
  const sessionId = jar.get(SESSION_COOKIE)?.value ?? null;
  if (!sessionId || !/^[a-f0-9]{64}$/.test(sessionId)) return null;
  await restoreFromMirror(sessionId, specialty, jar.get(PROFILE_MIRROR_COOKIE(specialty))?.value);
  return sessionId;
}
