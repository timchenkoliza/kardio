import { syncExplicitEventReferenceCandidates } from "@/server/ingestion/event-reference-sync";

const sourceRegistryId = process.env.TELEGRAM_SOURCE_ID ?? "cardiology_channel_01";
const report = await syncExplicitEventReferenceCandidates(sourceRegistryId);
console.log(JSON.stringify(report, null, 2));
