import { atom } from "jotai";
import type { Id } from "@/convex/_generated/dataModel";

// Chat input state
export const inputAtom = atom<string>("");
export const isLoadingAtom = atom<boolean>(false);

// UI settings
export const scanlinesEnabledAtom = atom<boolean>(true);

// Agent pane tabs
export type AgentTab = "tree" | "state" | "history" | "commands" | "dev";
export const activeAgentTabAtom = atom<AgentTab>("tree");

// Tree subtabs
export type TreeSubtab = "server" | "client";
export const activeTreeSubtabAtom = atom<TreeSubtab>("server");

// History subtabs
export type HistorySubtab = "steps" | "turns" | "messages" | "branches";
export const activeHistorySubtabAtom = atom<HistorySubtab>("steps");

// Step preview state
export const selectedStepIdAtom = atom<Id<"machineSteps"> | null>(null);
export const stepPreviewInstanceAtom = atom<unknown | null>(null);
export const isPreviewingAtom = atom<boolean>(false);
