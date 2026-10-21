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
const onReadingChange = vi.fn();

function renderDropZone(files: string[] = []) {
    act(() =>
        root.render(
            <FileDropZone
                files={files}
                onAdd={onAdd}
                onRemove={vi.fn()}
                onReadingChange={onReadingChange}
            />,
        ),
    );
}

beforeEach(() => {
    container = document.createElement("div");
    document.body.append(container);
    root = createRoot(container);
    renderDropZone();
});

afterEach(() => {
    act(() => root.unmount());
    container.remove();
    vi.restoreAllMocks();
    onAdd.mockReset();
    onReadingChange.mockReset();
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
    it("adds images and videos, holding every video as MP4", async () => {
        const toastError = vi.spyOn(toast, "error");

        await pickFiles([
            new File(["png"], "photo.png", { type: "image/png" }),
            new File(["mov"], "clip.mov", { type: "video/quicktime" }),
            new File(["webm"], "clip.webm", { type: "video/webm" }),
            new File(["txt"], "notes.txt", { type: "text/plain" }),
        ]);

        await vi.waitFor(() => expect(onAdd).toHaveBeenCalledOnce());
        expect(onAdd).toHaveBeenCalledWith([
            `data:image/png;base64,${btoa("png")}`,
            `data:video/mp4;base64,${btoa("mov")}`,
        ]);
        expect(onReadingChange.mock.calls).toEqual([[true], [false]]);
        expect(toastError.mock.calls).toEqual([
            ["clip.webm isn't an image or an MP4 or MOV video."],
            ["notes.txt isn't an image or an MP4 or MOV video."],
        ]);
    });

    it("rejects videos over 256 MB without reading them", async () => {
        const toastError = vi.spyOn(toast, "error");
        const readAsDataURL = vi.spyOn(FileReader.prototype, "readAsDataURL");
        const video = new File(["mp4"], "long.mp4", { type: "video/mp4" });
        Object.defineProperty(video, "size", { value: 256 * 1024 * 1024 + 1 });

        await pickFiles([video]);

        expect(toastError).toHaveBeenCalledWith(
            "long.mp4 is larger than 256 MB.",
        );
        expect(readAsDataURL).not.toHaveBeenCalled();
        expect(onAdd).not.toHaveBeenCalled();
        expect(onReadingChange).not.toHaveBeenCalled();
    });

    it("keeps the files that read when another one fails", async () => {
        const toastError = vi.spyOn(toast, "error");
        const read = FileReader.prototype.readAsDataURL;

        vi.spyOn(FileReader.prototype, "readAsDataURL").mockImplementation(
            function (this: FileReader, blob: Blob) {
                if (blob.type === "video/mp4") {
                    this.dispatchEvent(new Event("error"));
                } else {
                    read.call(this, blob);
                }
            },
        );

        await pickFiles([
            new File(["mp4"], "clip.mp4", { type: "video/mp4" }),
            new File(["png"], "photo.png", { type: "image/png" }),
        ]);

        await vi.waitFor(() => expect(onAdd).toHaveBeenCalledOnce());
        expect(onAdd).toHaveBeenCalledWith([
            `data:image/png;base64,${btoa("png")}`,
        ]);
        expect(toastError).toHaveBeenCalledWith(
            "Couldn't read one or more of the selected files.",
        );
    });

    it("previews videos as muted video thumbnails and images as images", () => {
        const image = "data:image/png;base64,AAAA";
        const video = "data:video/mp4;base64,AAAA";
        renderDropZone([image, video]);

        expect(container.querySelector("img")?.getAttribute("src")).toBe(image);
        const thumbnail = container.querySelector("video");
        expect(thumbnail?.getAttribute("src")).toBe(video);
        expect(thumbnail?.muted).toBe(true);
    });
});
