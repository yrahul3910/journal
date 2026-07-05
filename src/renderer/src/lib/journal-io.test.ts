/**
 * @vitest-environment jsdom
 */
import { describe, it, expect, beforeEach, vi } from "vitest";
import { exportToHTML } from "./journal-io";
import { useJournalStore } from "@/store/journal-store";
import type { JournalData } from "@/types/journal";

const fixture: JournalData = {
    version: 7,
    entries: [
        {
            entryDate: "2026-03-15T12:00:00Z",
            content: "# Trip\n\nGreat **day** out.",
            sentiment: "Happy",
            attachments: ["data:image/png;base64,AAAA"],
            nsfw: false,
        },
        {
            entryDate: "2026-01-02T12:00:00Z",
            content: "A quiet start to the year.",
            sentiment: "Neutral",
            attachments: [],
            nsfw: true,
        },
    ],
};

beforeEach(() => {
    useJournalStore.setState(useJournalStore.getInitialState(), true);
});

describe("exportToHTML", () => {
    it("generates deterministic HTML for a journal (snapshot)", async () => {
        let capturedHtml = "";
        (window as unknown as { electron: unknown }).electron = {
            exportHtml: vi.fn(async ({ html }: { html: string }) => {
                capturedHtml = html;
                return { success: true, filePath: "/tmp/out.html" };
            }),
        };

        useJournalStore.setState({ journalData: fixture });

        const result = await exportToHTML();
        expect(result.success).toBe(true);
        expect(capturedHtml).toMatchSnapshot();
    });

    it("fails clearly when no journal is open", async () => {
        const result = await exportToHTML();
        expect(result).toEqual({ success: false, error: "No journal is open" });
    });
});
