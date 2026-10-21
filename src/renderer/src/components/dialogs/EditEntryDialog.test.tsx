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

const image = `data:image/png;base64,${btoa("png")}`;
const video = "data:video/mp4;base64,bW92";
let root: Root;
let heldReads: FileReader[];

beforeEach(() => {
    // Hold video reads open until a test finishes them, the way a large
    // video outlasts a photo picked after it.
    heldReads = [];
    const read = FileReader.prototype.readAsDataURL;

    vi.spyOn(FileReader.prototype, "readAsDataURL").mockImplementation(
        function (this: FileReader, blob: Blob) {
            if (blob.type === "video/mp4") {
                heldReads.push(this);
            } else {
                read.call(this, blob);
            }
        },
    );

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
    vi.restoreAllMocks();
    useJournalStore.setState(useJournalStore.getInitialState(), true);
});

function button(label: RegExp) {
    return [...document.body.querySelectorAll("button")].find((element) =>
        label.test(element.textContent ?? ""),
    );
}

const submit = () => button(/Add Entry|Reading attachments/);

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

async function finishHeldRead(result: string) {
    await act(async () => {
        Object.defineProperty(heldReads[0], "result", { value: result });
        heldReads[0].dispatchEvent(new Event("load"));
    });
}

describe("EditEntryDialog", () => {
    it("keeps attachments whose reads overlap and waits for them before adding", async () => {
        await pick(new File(["mov"], "clip.mov", { type: "video/quicktime" }));
        await pick(new File(["png"], "photo.png", { type: "image/png" }));
        await vi.waitFor(() =>
            expect(document.body.querySelector("img")).not.toBeNull(),
        );

        expect(submit()?.textContent).toBe("Reading attachments...");
        expect(submit()?.disabled).toBe(true);

        await finishHeldRead(video);

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

    it("drops a read that finishes after the editor is closed", async () => {
        await pick(new File(["mov"], "clip.mov", { type: "video/quicktime" }));

        act(() => button(/^Cancel$/)?.click());
        act(() => button(/^Discard$/)?.click());
        expect(useJournalStore.getState().activeDialog).toBeNull();

        // The stale read lands only after the next edit session has begun.
        act(() => useJournalStore.setState({ activeDialog: "edit" }));
        await finishHeldRead(video);

        expect(useJournalStore.getState().encodedAttachments).toEqual([]);
        expect(submit()?.textContent).toBe("Add Entry");
    });
});
