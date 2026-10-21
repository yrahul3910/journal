import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { readAttachment, writeAttachment } from "./attachments";

const bytes = Buffer.from([0x00, 0x00, 0x00, 0x18, 0x66, 0x74, 0x79, 0x70]);
const base64 = bytes.toString("base64");
let dir: string;

beforeEach(() => {
    dir = mkdtempSync(join(tmpdir(), "jb-att-"));
});

afterEach(() => {
    rmSync(dir, { recursive: true });
});

describe("attachments", () => {
    it("archives each attachment under its MIME type's extension", () => {
        expect(
            writeAttachment(dir, "a", `data:image/jpeg;base64,${base64}`),
        ).toBe("./_jbfiles/images/a.jpg");
        expect(
            writeAttachment(dir, "b", `data:image/gif;base64,${base64}`),
        ).toBe("./_jbfiles/images/b.png");
        expect(
            writeAttachment(dir, "c", `data:video/mp4;base64,${base64}`),
        ).toBe("./_jbfiles/images/c.mp4");
        expect(readFileSync(join(dir, "c.mp4"))).toEqual(bytes);
    });

    it("reads MP4 and MOV files back as video/mp4 data: URLs", () => {
        writeFileSync(join(dir, "clip.mp4"), bytes);
        writeFileSync(join(dir, "clip.MOV"), bytes);
        writeFileSync(join(dir, "photo.jpg"), bytes);

        expect(readAttachment(dir, "./_jbfiles/images/clip.mp4")).toBe(
            `data:video/mp4;base64,${base64}`,
        );
        expect(readAttachment(dir, "./_jbfiles/images/clip.MOV")).toBe(
            `data:video/mp4;base64,${base64}`,
        );
        expect(readAttachment(dir, "./_jbfiles/images/photo.jpg")).toBe(
            `data:image/jpeg;base64,${base64}`,
        );
        expect(readAttachment(dir, "./_jbfiles/images/gone.mp4")).toBeNull();
    });
});
