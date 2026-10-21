import { randomUUID } from "node:crypto";
import fs from "node:fs";
import path from "node:path";

// The renderer loads attachment files through this scheme instead of holding
// their bytes, so large videos never become JavaScript strings.
export const ATTACHMENT_SCHEME = "journalbear";
const ATTACHMENT_URL_PREFIX = `${ATTACHMENT_SCHEME}://attachments/`;
// Only src attributes, so a URL quoted in an entry's text is left alone.
const ATTACHMENT_SRC_PATTERN = new RegExp(
    `src="(${ATTACHMENT_URL_PREFIX}[^"]+)"`,
    "g",
);

// Chromium refuses video/quicktime but plays MOV files labeled as MP4, the
// same container family, so every video is served as video/mp4 and archived
// as .mp4.
const MIME_TYPE_BY_EXTENSION = new Map([
    ["jpg", "image/jpeg"],
    ["jpeg", "image/jpeg"],
    ["png", "image/png"],
    ["gif", "image/gif"],
    ["webp", "image/webp"],
    ["svg", "image/svg+xml"],
    ["mp4", "video/mp4"],
    ["mov", "video/mp4"],
]);

const EXTENSION_BY_MIME_TYPE = new Map([
    ["image/jpeg", "jpg"],
    ["image/png", "png"],
]);

// Files are copied as clones where the filesystem supports it (APFS, Btrfs),
// which makes copying even a large video nearly free.
const CLONE = fs.constants.COPYFILE_FICLONE;

function attachmentUrl(filename: string): string {
    return ATTACHMENT_URL_PREFIX + encodeURIComponent(filename);
}

// `basename` keeps a crafted URL from reaching outside `imagesDir`.
function attachmentPath(imagesDir: string, url: string): string {
    const { pathname } = new URL(url);
    return path.join(imagesDir, path.basename(decodeURIComponent(pathname)));
}

/**
 * The byte range a `Range` header asks for, or null to send the whole file:
 * when there is no header, several ranges, or an invalid range, which RFC 9110
 * says to ignore. `end` is clamped to the file; a `start` at or past the end
 * of the file is left for the caller to reject.
 */
function requestedRange(
    header: string | null,
    size: number,
): { start: number; end: number } | null {
    const match = /^bytes=(\d*)-(\d*)$/.exec(header ?? "");
    if (!match || (!match[1] && !match[2])) return null;

    if (!match[1]) {
        return { start: Math.max(size - Number(match[2]), 0), end: size - 1 };
    }

    const start = Number(match[1]);
    if (match[2] && Number(match[2]) < start) return null;

    return {
        start,
        end: match[2] ? Math.min(Number(match[2]), size - 1) : size - 1,
    };
}

/**
 * Resolve a 7.0 attachment path from `data.json` to the URL the renderer
 * loads it from.
 *
 * Only the filename of `ref` matters: it is looked up in `imagesDir`, which
 * holds every attachment, videos included. Returns null when the file is
 * missing so the caller can drop the dangling reference.
 */
export function resolveAttachment(
    imagesDir: string,
    ref: string,
): string | null {
    const filename = path.basename(ref);

    if (!filename || !fs.existsSync(path.join(imagesDir, filename))) {
        console.warn(`[DECRYPT] Attachment not found: ${ref}`);
        return null;
    }

    return attachmentUrl(filename);
}

/**
 * Answer the renderer's request for an attachment URL with the file from
 * `imagesDir`.
 *
 * Media elements only seek within resources that honor byte ranges, so a
 * `Range: bytes=start-end` request (or a suffix range, `bytes=-length`) gets a
 * 206 with just those bytes and every response advertises range support. A
 * range starting past the end of the file gets a 416, and a missing file a 404.
 */
export async function serveAttachment(
    request: Request,
    imagesDir: string,
): Promise<Response> {
    const file = attachmentPath(imagesDir, request.url);
    if (!fs.existsSync(file)) return new Response(null, { status: 404 });

    // A file-backed blob reads lazily, so slicing out a range never loads the
    // rest of a large video.
    const blob = await fs.openAsBlob(file);
    const size = blob.size;
    const extension = path.extname(file).slice(1).toLowerCase();
    const headers = {
        "content-type":
            MIME_TYPE_BY_EXTENSION.get(extension) ?? "application/octet-stream",
        "accept-ranges": "bytes",
    };
    const range = requestedRange(request.headers.get("range"), size);

    if (!range) {
        return new Response(blob, {
            headers: { ...headers, "content-length": String(size) },
        });
    }

    const { start, end } = range;

    if (start >= size) {
        return new Response(null, {
            status: 416,
            headers: { "content-range": `bytes */${size}` },
        });
    }

    return new Response(blob.slice(start, end + 1), {
        status: 206,
        headers: {
            ...headers,
            "content-length": String(end - start + 1),
            "content-range": `bytes ${start}-${end}/${size}`,
        },
    });
}

/**
 * Copy a file the user picked into `imagesDir` under a fresh name and return
 * the URL the renderer loads it from.
 *
 * Videos are named .mp4 whatever their container, matching how every
 * JournalBear app archives them; images keep their extension. The copy is
 * asynchronous, since outside a clone-capable volume it is a full copy of a
 * possibly large video.
 */
export async function importAttachment(
    sourcePath: string,
    imagesDir: string,
): Promise<string> {
    const extension = path.extname(sourcePath).toLowerCase();
    const isVideo =
        MIME_TYPE_BY_EXTENSION.get(extension.slice(1)) === "video/mp4";
    const filename = randomUUID() + (isVideo ? ".mp4" : extension);

    await fs.promises.mkdir(imagesDir, { recursive: true });
    await fs.promises.copyFile(
        sourcePath,
        path.join(imagesDir, filename),
        CLONE,
    );

    return attachmentUrl(filename);
}

/**
 * Put one in-memory attachment into `stagingDir` for archiving and return the
 * path `data.json` stores for it.
 *
 * Attachment URLs are copied from `imagesDir` under their own name. Inline
 * data: URLs, which only migrated 5.1 journals have, are decoded into
 * `<baseName>.<extension>`, with the extension from the MIME type (.png when
 * there is no mapping).
 */
export async function stageAttachment(
    attachment: string,
    imagesDir: string,
    stagingDir: string,
    baseName: string,
): Promise<string> {
    if (attachment.startsWith("data:")) {
        const mimeType = attachment.slice(
            "data:".length,
            attachment.indexOf(";"),
        );
        const filename = `${baseName}.${EXTENSION_BY_MIME_TYPE.get(mimeType) ?? "png"}`;
        const base64 = attachment.slice(attachment.indexOf(",") + 1);

        await fs.promises.writeFile(
            path.join(stagingDir, filename),
            Buffer.from(base64, "base64"),
        );
        return `./_jbfiles/images/${filename}`;
    }

    const source = attachmentPath(imagesDir, attachment);
    const filename = path.basename(source);

    await fs.promises.copyFile(source, path.join(stagingDir, filename), CLONE);
    return `./_jbfiles/images/${filename}`;
}

/**
 * Copy every attachment file `html` shows into a `<name>_files` folder beside
 * `htmlPath` and point those src attributes at the copies, so an exported
 * journal opens without the app. Returns the rewritten HTML.
 *
 * Inline data: URLs are left as they are, and so is the URL of a file that is
 * missing, so one dangling attachment can't abort the whole export.
 */
export async function exportAttachments(
    html: string,
    imagesDir: string,
    htmlPath: string,
): Promise<string> {
    const folderName = `${path.basename(htmlPath, path.extname(htmlPath))}_files`;
    const folder = path.join(path.dirname(htmlPath), folderName);
    const exported = new Map<string, string>();

    for (const [, url] of html.matchAll(ATTACHMENT_SRC_PATTERN)) {
        const source = attachmentPath(imagesDir, url);
        if (exported.has(url) || !fs.existsSync(source)) continue;

        const filename = path.basename(source);
        await fs.promises.mkdir(folder, { recursive: true });
        await fs.promises.copyFile(source, path.join(folder, filename), CLONE);
        exported.set(
            url,
            `${encodeURIComponent(folderName)}/${encodeURIComponent(filename)}`,
        );
    }

    return html.replaceAll(ATTACHMENT_SRC_PATTERN, (match, url: string) => {
        const relativePath = exported.get(url);
        return relativePath ? `src="${relativePath}"` : match;
    });
}
