/**
 * @vitest-environment jsdom
 */
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { toast } from "sonner";
import {
    afterEach,
    assert,
    beforeEach,
    describe,
    expect,
    it,
    vi,
} from "vitest";

import { FileDropZone } from "./FileDropZone";

Reflect.set(globalThis, "IS_REACT_ACT_ENVIRONMENT", true);

let container: HTMLDivElement;
let root: Root;
const onAdd = vi.fn();
const onImportingChange = vi.fn();
const importAttachment = vi.fn(
    async (path: string) =>
        `journalbear://attachments/${path.split("/").pop()}`,
);

function renderDropZone(files: string[] = []) {
    act(() =>
        root.render(
            <FileDropZone
                files={files}
                onAdd={onAdd}
                onRemove={vi.fn()}
                onImportingChange={onImportingChange}
            />,
        ),
    );
}

beforeEach(() => {
    vi.stubGlobal("electron", {
        // Files dragged from a web page have no path on disk.
        getPathForFile: (file: File) =>
            file.name === "dragged.png" ? "" : `/picked/${file.name}`,
        importAttachment,
    });
    container = document.createElement("div");
    document.body.append(container);
    root = createRoot(container);
    renderDropZone();
});

afterEach(() => {
    act(() => root.unmount());
    container.remove();
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
    onAdd.mockReset();
    onImportingChange.mockReset();
    importAttachment.mockClear();
});

async function pickFiles(files: File[]) {
    const input = container.querySelector("input[type=file]");
    assert(input);

    // jsdom can't construct a FileList, so an array stands in for the
    // picker's selection.
    Object.defineProperty(input, "files", { value: files });

    await act(async () => {
        input.dispatchEvent(new Event("change", { bubbles: true }));
    });
}

describe("FileDropZone", () => {
    it("imports images and MP4/MOV videos by path and rejects other files", async () => {
        const toastError = vi.spyOn(toast, "error");

        await pickFiles([
            new File(["png"], "photo.png", { type: "image/png" }),
            new File(["mov"], "clip.mov", { type: "video/quicktime" }),
            new File(["webm"], "clip.webm", { type: "video/webm" }),
            new File(["txt"], "notes.txt", { type: "text/plain" }),
            new File(["png"], "dragged.png", { type: "image/png" }),
        ]);

        await vi.waitFor(() => expect(onAdd).toHaveBeenCalledOnce());
        expect(importAttachment.mock.calls).toEqual([
            ["/picked/photo.png"],
            ["/picked/clip.mov"],
        ]);
        expect(onAdd).toHaveBeenCalledWith([
            "journalbear://attachments/photo.png",
            "journalbear://attachments/clip.mov",
        ]);
        expect(onImportingChange.mock.calls).toEqual([[true], [false]]);
        expect(toastError.mock.calls).toEqual([
            ["clip.webm isn't an image or an MP4 or MOV video."],
            ["notes.txt isn't an image or an MP4 or MOV video."],
            [
                "dragged.png isn't saved on this computer. Save it, then attach the file.",
            ],
        ]);
    });

    it("keeps the files that import when another one fails", async () => {
        const toastError = vi.spyOn(toast, "error");
        importAttachment.mockRejectedValueOnce(new Error("copy failed"));

        await pickFiles([
            new File(["mp4"], "clip.mp4", { type: "video/mp4" }),
            new File(["png"], "photo.png", { type: "image/png" }),
        ]);

        await vi.waitFor(() => expect(onAdd).toHaveBeenCalledOnce());
        expect(onAdd).toHaveBeenCalledWith([
            "journalbear://attachments/photo.png",
        ]);
        expect(toastError).toHaveBeenCalledWith(
            "Couldn't add one or more of the selected files.",
        );
    });

    it("previews videos as muted video thumbnails and images as images", () => {
        const image = "journalbear://attachments/photo.png";
        const video = "journalbear://attachments/clip.mp4";
        renderDropZone([image, video]);

        expect(container.querySelector("img")?.getAttribute("src")).toBe(image);
        const thumbnail = container.querySelector("video");
        expect(thumbnail?.getAttribute("src")).toBe(video);
        expect(thumbnail?.muted).toBe(true);
    });
});
