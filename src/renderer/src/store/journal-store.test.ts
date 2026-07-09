/**
 * @vitest-environment jsdom
 */
import { describe, it, expect, beforeEach } from "vitest";
import { useJournalStore } from "./journal-store";
import type { JournalData, JournalEntry } from "../types/journal";

function entry(
    partial: Partial<JournalEntry> & { entryDate: string },
): JournalEntry {
    return {
        content: "",
        sentiment: "Neutral",
        attachments: [],
        ...partial,
    };
}

function journal(entries: JournalEntry[]): JournalData {
    return { version: 7, entries };
}

beforeEach(() => {
    useJournalStore.setState(useJournalStore.getInitialState(), true);
});

describe("data operations", () => {
    it("addEntry inserts and keeps entries sorted newest-first", () => {
        const store = useJournalStore.getState();
        store.setJournalData(journal([entry({ entryDate: "2024-01-10" })]));
        store.addEntry(entry({ entryDate: "2024-03-01" }));
        store.addEntry(entry({ entryDate: "2024-02-01" }));

        const dates = useJournalStore
            .getState()
            .journalData!.entries.map((e) => e.entryDate);
        expect(dates).toEqual(["2024-03-01", "2024-02-01", "2024-01-10"]);
    });

    it("updateEntry replaces the entry at an index and re-sorts", () => {
        const store = useJournalStore.getState();
        store.setJournalData(
            journal([
                entry({ entryDate: "2024-03-01", content: "newest" }),
                entry({ entryDate: "2024-01-01", content: "oldest" }),
            ]),
        );
        store.updateEntry(
            1,
            entry({ entryDate: "2024-12-31", content: "updated" }),
        );

        expect(useJournalStore.getState().journalData!.entries[0].content).toBe(
            "updated",
        );
    });

    it("deleteEntry removes the entry at the given index", () => {
        const store = useJournalStore.getState();
        store.setJournalData(
            journal([
                entry({ entryDate: "2024-03-01", content: "keep" }),
                entry({ entryDate: "2024-02-01", content: "remove" }),
            ]),
        );
        store.deleteEntry(1);

        const entries = useJournalStore.getState().journalData!.entries;
        expect(entries).toHaveLength(1);
        expect(entries[0].content).toBe("keep");
    });

    it("getEntryCount reflects the number of entries (0 when empty)", () => {
        expect(useJournalStore.getState().getEntryCount()).toBe(0);
        useJournalStore
            .getState()
            .setJournalData(journal([entry({ entryDate: "2024-01-01" })]));
        expect(useJournalStore.getState().getEntryCount()).toBe(1);
    });

    it("getEntriesByYear groups entries by calendar year", () => {
        // Midday UTC so the local-time year is unambiguous across timezones.
        useJournalStore
            .getState()
            .setJournalData(
                journal([
                    entry({ entryDate: "2023-05-01T12:00:00Z" }),
                    entry({ entryDate: "2024-06-01T12:00:00Z" }),
                    entry({ entryDate: "2024-09-01T12:00:00Z" }),
                ]),
            );
        const byYear = useJournalStore.getState().getEntriesByYear();
        expect(Object.keys(byYear).sort()).toEqual(["2023", "2024"]);
        expect(byYear[2024]).toHaveLength(2);
    });

    it("clearJournal resets the journal and view", () => {
        const store = useJournalStore.getState();
        store.setJournalData(journal([entry({ entryDate: "2024-01-01" })]));
        store.clearJournal();
        const state = useJournalStore.getState();
        expect(state.journalData).toBeNull();
        expect(state.viewMode).toBe("welcome");
    });
});

describe("filtering", () => {
    beforeEach(() => {
        useJournalStore.getState().setJournalData(
            journal([
                entry({
                    entryDate: "2024-01-01",
                    content: "Happy day at the park",
                    sentiment: "Happy",
                    attachments: ["a.jpg"],
                }),
                entry({
                    entryDate: "2024-02-01",
                    content: "A sad rainy afternoon",
                    sentiment: "Sad",
                }),
                entry({
                    entryDate: "2024-03-01",
                    content: "Excited about the trip",
                    sentiment: "Excited",
                }),
            ]),
        );
    });

    it("filters by case-insensitive text", () => {
        useJournalStore.getState().setSearchFilters({ text: "HAPPY" });
        const results = useJournalStore.getState().getFilteredEntries();
        expect(results).toHaveLength(1);
        expect(results[0].content).toContain("park");
    });

    it("filters by sentiment but treats 'all' as no filter", () => {
        useJournalStore.getState().setSearchFilters({ sentiment: "Sad" });
        expect(useJournalStore.getState().getFilteredEntries()).toHaveLength(1);

        useJournalStore.getState().setSearchFilters({ sentiment: "all" });
        expect(useJournalStore.getState().getFilteredEntries()).toHaveLength(3);
    });

    it("filters by attachment presence", () => {
        useJournalStore.getState().setSearchFilters({ hasAttachment: true });
        expect(useJournalStore.getState().getFilteredEntries()).toHaveLength(1);

        useJournalStore.getState().setSearchFilters({ hasAttachment: false });
        expect(useJournalStore.getState().getFilteredEntries()).toHaveLength(2);
    });
});

describe("theme", () => {
    it("setTheme toggles the dark class on the document element", () => {
        useJournalStore.getState().setTheme("dark");
        expect(document.documentElement.classList.contains("dark")).toBe(true);

        useJournalStore.getState().setTheme("light");
        expect(document.documentElement.classList.contains("dark")).toBe(false);
    });
});
