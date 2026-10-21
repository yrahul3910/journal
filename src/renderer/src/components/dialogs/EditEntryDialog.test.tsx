/**
 * @vitest-environment jsdom
 */
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import {
    afterEach,
    assert,
    beforeEach,
    describe,
    expect,
    it,
    vi,
} from "vitest";

import { useJournalStore } from "@/store/journal-store";

import { EditEntryDialog } from "./EditEntryDialog";

Reflect.set(globalThis, "IS_REACT_ACT_ENVIRONMENT", true);

const image = "journalbear://attachments/photo.png";
const video = "journalbear://attachments/clip.mp4";
let root: Root;
let finishHeldImport: (url: string) => void;

beforeEach(() => {
    // Hold video imports open until a test finishes them, the way a large
    // video outlasts a photo picked after it.
    vi.stubGlobal("electron", {
        getPathForFile: (file: File) => `/picked/${file.name}`,
        importAttachment: (path: string) =>
            path.endsWith(".mov")
                ? new Promise<string>((resolve) => {
                      finishHeldImport = resolve;
                  })
                : Promise.resolve(image),
    });

    useJournalStore.setState({
        journalData: { version: 7, entries: [] },
        activeDialog: "edit",
        isNewEntry: true,
    });
    root = createRoot(document.createElement("div"));
    act(() => root.render(<EditEntryDialog />));
});

afterEach(() => {
    act(() => root.unmount());
    vi.unstubAllGlobals();
    useJournalStore.setState(useJournalStore.getInitialState(), true);
});

function button(label: RegExp) {
    return [...document.body.querySelectorAll("button")].find((element) =>
        label.test(element.textContent ?? ""),
    );
}

const submit = () => button(/Add Entry|Adding attachments/);

async function pick(file: File) {
    const input = document.body.querySelector("input[type=file]");
    assert(input);
    Object.defineProperty(input, "files", {
        value: [file],
        configurable: true,
    });

    await act(async () => {
        input.dispatchEvent(new Event("change", { bubbles: true }));
    });
}

async function finishImport(url: string) {
    await act(async () => finishHeldImport(url));
}

describe("EditEntryDialog", () => {
    it("keeps attachments whose imports overlap and waits for them before adding", async () => {
        await pick(new File(["mov"], "clip.mov", { type: "video/quicktime" }));
        await pick(new File(["png"], "photo.png", { type: "image/png" }));
        await vi.waitFor(() =>
            expect(document.body.querySelector("img")).not.toBeNull(),
        );

        expect(submit()?.textContent).toBe("Adding attachments...");
        expect(submit()?.disabled).toBe(true);

        await finishImport(video);

        expect(submit()?.textContent).toBe("Add Entry");
        expect(useJournalStore.getState().encodedAttachments).toEqual([
            image,
            video,
        ]);

        act(() => submit()?.click());

        expect(
            useJournalStore.getState().journalData?.entries[0].attachments,
        ).toEqual([image, video]);
    });

    it("drops an import that finishes after the editor is closed", async () => {
        await pick(new File(["mov"], "clip.mov", { type: "video/quicktime" }));

        act(() => button(/^Cancel$/)?.click());
        act(() => button(/^Discard$/)?.click());
        expect(useJournalStore.getState().activeDialog).toBeNull();

        // The stale import lands only after the next edit session has begun.
        act(() => useJournalStore.setState({ activeDialog: "edit" }));
        await finishImport(video);

        expect(useJournalStore.getState().encodedAttachments).toEqual([]);
        expect(submit()?.textContent).toBe("Add Entry");
    });
});
