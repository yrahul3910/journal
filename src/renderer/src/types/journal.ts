// The on-disk journal format (schemas + inferred types) lives in src/shared so
// the main process can validate against the same contract. Only the types are
// re-exported here; they erase at compile time, so the renderer never bundles zod.
import type {
    Sentiment,
    JournalEntry,
    JournalData,
    JournalEntry51,
    JournalData51,
} from "../../../shared/journal";

export type {
    Sentiment,
    JournalEntry,
    JournalData,
    JournalEntry51,
    JournalData51,
};

export { VERSION_NUMBER } from "../../../shared/constants";

// Renderer-only view and UI types.
export type ViewMode = "welcome" | "journal";

export type DialogType =
    | "edit"
    | "newJournal"
    | "decrypt"
    | "search"
    | "statistics"
    | "about"
    | "intro"
    | "error"
    | null;

export interface SearchFilters {
    text?: string;
    sentiment?: Sentiment | "all";
    hasAttachment?: boolean;
}

export interface StatisticsFilter {
    year?: number | "all";
}

export const SENTIMENT_COLORS: Record<Sentiment | "Unknown", string> = {
    Happy: "green",
    Angry: "red",
    Sad: "#FBCA04",
    Neutral: "gray",
    Loved: "hotpink",
    Excited: "lime",
    Unknown: "black",
};
