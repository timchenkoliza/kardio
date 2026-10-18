"use client";

import { useEffect, useRef } from "react";
import type { Currentness, SpecialtyId } from "@/lib/domain/types";
import { useProduct } from "./product-provider";

export function ContentOpenTracker({ contentId, sourceId, specialty, currentness }: {
  contentId: string;
  sourceId: string;
  specialty: SpecialtyId;
  currentness: Currentness;
}) {
  const { mutate, track } = useProduct();
  const sent = useRef(false);

  useEffect(() => {
    if (sent.current) return;
    sent.current = true;
    track("content_opened", { contentId, sourceId, currentness });
    void mutate({ action: "recent", entry: { kind: "content", specialty, id: contentId } });
  }, [contentId, currentness, mutate, sourceId, specialty, track]);

  return null;
}
