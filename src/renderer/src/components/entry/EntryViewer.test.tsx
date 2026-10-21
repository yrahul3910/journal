/**
 * @vitest-environment jsdom
 */
import { act } from "react";
import { createRoot } from "react-dom/client";
import { beforeEach, describe, expect, it } from "vitest";

import { useJournalStore } from "@/store/journal-store";

import { EntryViewer } from "./EntryViewer";

Reflect.set(globalThis, "IS_REACT_ACT_ENVIRONMENT", true);

beforeEach(() => {
    useJournalStore.setState(useJournalStore.getInitialState(), true);
});

describe("EntryViewer", () => {
    it("plays video attachments inline and shows images as images", () => {
        const image = "journalbear://attachments/photo.png";
        const video = "journalbear://attachments/clip.mp4";
        useJournalStore.setState({
            selectedEntry: {
                entryDate: "2026-03-15T12:00:00Z",
                content: "A day out.",
                sentiment: "Happy",
                attachments: [image, video],
            },
        });

        const container = document.createElement("div");
        const root = createRoot(container);
        act(() => root.render(<EntryViewer />));

        expect(container.querySelector("img")?.getAttribute("src")).toBe(image);
        const player = container.querySelector("video");
        expect(player?.getAttribute("src")).toBe(video);
        expect(player?.controls).toBe(true);
        expect(player?.getAttribute("aria-label")).toBe("Attachment 2");

        act(() => root.unmount());
    });
});
