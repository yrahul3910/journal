import {
    mkdirSync,
    mkdtempSync,
    readFileSync,
    rmSync,
    writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";

import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { z } from "zod";

import { JournalDataSchema } from "../shared/journal";
import { decompress } from "./archive";
import {
    exportAttachments,
    importAttachment,
    resolveAttachment,
    serveAttachment,
    stageAttachment,
} from "./attachments";
import { decryptFile } from "./encryption";

const bytes = Buffer.from("0123456789");
let root: string;
let imagesDir: string;

beforeEach(() => {
    root = mkdtempSync(join(tmpdir(), "jb-att-"));
    imagesDir = join(root, "images");
    mkdirSync(imagesDir);
});

afterEach(() => {
    rmSync(root, { recursive: true });
});

async function serve(url: string, range?: string) {
    const headers: Record<string, string> = range ? { range } : {};
    const response = await serveAttachment(
        new Request(url, { headers }),
        imagesDir,
    );

    return { response, body: await response.text() };
}

describe("resolveAttachment", () => {
    it("resolves archive paths to attachment URLs and drops missing files", () => {
        writeFileSync(join(imagesDir, "Tue Jun 16_0.MOV"), bytes);

        expect(
            resolveAttachment(imagesDir, "./_jbfiles/images/Tue Jun 16_0.MOV"),
        ).toBe("journalbear://attachments/Tue%20Jun%2016_0.MOV");
        expect(
            resolveAttachment(imagesDir, "./_jbfiles/images/gone.mp4"),
        ).toBeNull();
    });
});

describe("serveAttachment", () => {
    it("serves whole files and byte ranges, labeling MOV as MP4", async () => {
        writeFileSync(join(imagesDir, "clip.mov"), bytes);
        const url = "journalbear://attachments/clip.mov";

        const whole = await serve(url);
        expect(whole.response.status).toBe(200);
        expect(whole.response.headers.get("content-type")).toBe("video/mp4");
        expect(whole.response.headers.get("accept-ranges")).toBe("bytes");
        expect(whole.body).toBe("0123456789");

        const range = await serve(url, "bytes=2-5");
        expect(range.response.status).toBe(206);
        expect(range.response.headers.get("content-range")).toBe(
            "bytes 2-5/10",
        );
        expect(range.body).toBe("2345");

        expect((await serve(url, "bytes=7-")).body).toBe("789");
        expect((await serve(url, "bytes=-3")).body).toBe("789");
        expect((await serve(url, "bytes=20-")).response.status).toBe(416);

        // RFC 9110: an invalid range is ignored and the whole file is sent.
        const inverted = await serve(url, "bytes=5-2");
        expect(inverted.response.status).toBe(200);
        expect(inverted.body).toBe("0123456789");
    });

    it("answers 404 for files outside the images folder", async () => {
        writeFileSync(join(root, "secret.txt"), bytes);

        expect(
            (await serve("journalbear://attachments/missing.mp4")).response
                .status,
        ).toBe(404);
        expect(
            (await serve("journalbear://attachments/..%2Fsecret.txt")).response
                .status,
        ).toBe(404);
    });
});

describe("importAttachment", () => {
    it("copies picked files in under fresh names, naming videos .mp4", async () => {
        const picked = join(root, "picked");
        mkdirSync(picked);
        writeFileSync(join(picked, "trip.MOV"), bytes);
        writeFileSync(join(picked, "photo.JPG"), bytes);

        const video = await importAttachment(
            join(picked, "trip.MOV"),
            imagesDir,
        );
        const image = await importAttachment(
            join(picked, "photo.JPG"),
            imagesDir,
        );

        expect(video).toMatch(
            /^journalbear:\/\/attachments\/[0-9a-f-]{36}\.mp4$/,
        );
        expect(image).toMatch(
            /^journalbear:\/\/attachments\/[0-9a-f-]{36}\.jpg$/,
        );
        expect(
            readFileSync(join(imagesDir, video.split("/").pop() ?? "")),
        ).toEqual(bytes);
    });
});

describe("stageAttachment", () => {
    it("copies attachment files and decodes inline data: URLs", async () => {
        const staging = join(root, "staging");
        mkdirSync(staging);
        writeFileSync(join(imagesDir, "clip.mp4"), bytes);
        const base64 = bytes.toString("base64");

        expect(
            await stageAttachment(
                "journalbear://attachments/clip.mp4",
                imagesDir,
                staging,
                "a",
            ),
        ).toBe("./_jbfiles/images/clip.mp4");
        expect(
            await stageAttachment(
                `data:image/jpeg;base64,${base64}`,
                imagesDir,
                staging,
                "b",
            ),
        ).toBe("./_jbfiles/images/b.jpg");
        expect(
            await stageAttachment(
                `data:image/gif;base64,${base64}`,
                imagesDir,
                staging,
                "c",
            ),
        ).toBe("./_jbfiles/images/c.png");
        expect(readFileSync(join(staging, "clip.mp4"))).toEqual(bytes);
        expect(readFileSync(join(staging, "b.jpg"))).toEqual(bytes);
    });
});

describe("exportAttachments", () => {
    it("copies shown files beside the export and rewrites only their src", async () => {
        writeFileSync(join(imagesDir, "clip.mp4"), bytes);
        const html = [
            '<video controls src="journalbear://attachments/clip.mp4"></video>',
            '<img src="journalbear://attachments/gone.png" alt="Attachment" />',
            '<img src="data:image/png;base64,AAAA" alt="Attachment" />',
            "<p>journalbear://attachments/clip.mp4</p>",
        ].join("\n");

        const exported = await exportAttachments(
            html,
            imagesDir,
            join(root, "My Journal.html"),
        );

        expect(exported).toBe(
            [
                '<video controls src="My%20Journal_files/clip.mp4"></video>',
                '<img src="journalbear://attachments/gone.png" alt="Attachment" />',
                '<img src="data:image/png;base64,AAAA" alt="Attachment" />',
                "<p>journalbear://attachments/clip.mp4</p>",
            ].join("\n"),
        );
        expect(
            readFileSync(join(root, "My Journal_files", "clip.mp4")),
        ).toEqual(bytes);
    });
});

describe("the committed fixture journals", () => {
    // The legacy one was written by the SwiftUI app, the 7.1 one by this app.
    it.each([
        ["test_journal.zjournal", 7],
        ["test_journal_7.1.zjournal", 7.1],
    ])("%s opens with its images and serves its video", async (name, version) => {
        const fixtures = fileURLToPath(
            new URL(
                "../../swiftui/JournalBearTests/Fixtures/",
                import.meta.url,
            ),
        );
        const archivePath = join(root, "journal.tar.gz");
        const extracted = join(root, "extracted");
        const extractedImages = join(extracted, "images");

        expect(
            await decryptFile(
                join(fixtures, name),
                archivePath,
                "$Password123",
            ),
        ).toBeNull();
        await decompress(archivePath, extracted);

        const data = z.parse(
            JournalDataSchema,
            JSON.parse(readFileSync(join(extracted, "data.json"), "utf8")),
        );
        const urls = data.entries.map((entry) =>
            entry.attachments.map((ref) =>
                resolveAttachment(extractedImages, ref),
            ),
        );

        expect(data.version).toBe(version);
        expect(urls.map((entry) => entry.length)).toEqual([2, 0, 1]);
        expect(
            urls
                .flat()
                .every((url) => url?.startsWith("journalbear://attachments/")),
        ).toBe(true);

        const video = urls[2][0] ?? "";
        const response = await serveAttachment(
            new Request(video),
            extractedImages,
        );
        expect(response.headers.get("content-type")).toBe("video/mp4");
        expect(Buffer.from(await response.arrayBuffer())).toEqual(
            readFileSync(join(fixtures, "clip.mp4")),
        );
    });
});
