import { atomWithStorage } from "jotai/utils";
import type { Id } from "../convex/_generated/dataModel";

export const sessionIdAtom = atomWithStorage<Id<"sessions"> | null>(
  "sessionId",
  null,
  undefined,
  { getOnInit: true }
);
