import { z } from "zod";
import { VERSION_NUMBER } from "./constants";

// Current format (7.0).
export const SentimentSchema = z.enum([
    "Happy",
    "Angry",
    "Sad",
    "Neutral",
    "Loved",
    "Excited",
]);
export const Sentiment51Schema = SentimentSchema.optional();
export type Sentiment = z.infer<typeof SentimentSchema>;

export const JournalEntrySchema = z.object({
    // On disk this is always a string (JSON has no Date). The `z.date()` arm only
    // exists so the inferred type matches the in-memory editor, which holds a Date
    // until it's serialized. Narrow this to `z.string()` once the editor serializes
    // at the boundary (e.g. `date.toISOString()`).
    entryDate: z.union([z.string(), z.date()]),
    content: z.string(),
    sentiment: SentimentSchema,
    attachments: z.array(z.string()),
    nsfw: z.boolean(),
});
export type JournalEntry = z.infer<typeof JournalEntrySchema>;

export const JournalDataSchema = z.object({
    version: z.number(),
    entries: z.array(JournalEntrySchema),
});
export type JournalData = z.infer<typeof JournalDataSchema>;

// Legacy format (5.1).
export const JournalEntry51Schema = z.object({
    entryDate: z.string(),
    content: z.string(),
    sentiment: Sentiment51Schema,
    // 5.1 used the singular `attachment` and treated it as optional.
    attachment: z.array(z.string()).or(z.string()).optional(),
    nsfw: z.boolean().optional(),
});
export type JournalEntry51 = z.infer<typeof JournalEntry51Schema>;

export const JournalData51Schema = z.object({
    version: z.number(),
    en: z.array(JournalEntry51Schema),
});
export type JournalData51 = z.infer<typeof JournalData51Schema>;

/**
 * Structural migration 5.1 -> 7.0: `en` -> `entries`, `attachment` ->
 * `attachments`, and fill in the fields that became required.
 *
 * Attachments are normalized to data: URLs (the in-memory form the renderer
 * displays). Persisting them as files under images/ is filesystem I/O and stays
 * in the main process at save time.
 */
export function migrate51to70(data: JournalData51): JournalData {
    const entries = data.en.map((entry) => ({
        entryDate: entry.entryDate,
        content: entry.content,
        sentiment: entry.sentiment ?? "Neutral",
        attachments: normalizeAttachments(entry.entryDate, entry.attachment),
        nsfw: entry.nsfw ?? false,
    }));

    // Diagnostic: do any 5.1 journals store attachments as file paths rather than
    // inline base64? Those pass through untouched and would need main-process
    // resolution; this tells us whether that case actually exists in real data.
    const filePathCount = entries
        .flatMap((entry) => entry.attachments)
        .filter(looksLikeFilePath).length;
    if (filePathCount > 0) {
        console.log(
            `[MIGRATE] ${filePathCount} attachment(s) look like file paths, not inline base64`,
        );
    }

    return { version: VERSION_NUMBER, entries };
}

// 5.1 stored attachments as inline base64 in a few shapes. Normalize each to a
// data: URL. File-path attachments (if any) are left untouched for the main
// process to resolve, since reading them is filesystem I/O.
function normalizeAttachments(
    entryDate: string,
    attachment: string[] | string | undefined,
): string[] {
    if (attachment == null) return [];
    const items = Array.isArray(attachment) ? attachment : [attachment];
    return items
        .map((item) => {
            if (!item.trim()) {
                return null;
            }
            if (item.startsWith("data:image/")) {
                console.log("[OLD]", entryDate);
                return item;
            }
            if (item.startsWith("iVBOR")) {
                console.log("[OLD]", entryDate);
                return `data:image/png;base64,${item}`;
            }
            if (looksLikeFilePath(item)) return item;
            // TODO: This fires on the real journal several times, e.g., 2017-10-01, so
            // the save file migration in index.ts probably isn't firing (since the journal
            // on viewing that entry does not seem to display anything
            // But the below never prints, so it's not random strings
            console.log("[REALLY_OLD]", entryDate, "   ", item.slice(0, 20));
            return `data:image/jpeg;base64,${item}`; // /9j/ and unrecognized raw base64
        })
        .filter((el) => el !== null);
}

function looksLikeFilePath(item: string): boolean {
    return (
        item.includes("_jbfiles/") ||
        item.includes("images/") ||
        /\.(jpe?g|png)$/i.test(item)
    );
}
