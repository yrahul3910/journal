import fs from "node:fs";
import path from "node:path";

// Chromium refuses video/quicktime but plays MOV files labeled as MP4, the
// same container family, so every video is held as video/mp4 in memory and
// archived as .mp4.
const MIME_TYPE_BY_EXTENSION = new Map([
    ["jpg", "image/jpeg"],
    ["jpeg", "image/jpeg"],
    ["png", "image/png"],
    ["mp4", "video/mp4"],
    ["mov", "video/mp4"],
]);

const EXTENSION_BY_MIME_TYPE = new Map([
    ["image/jpeg", "jpg"],
    ["image/png", "png"],
    ["video/mp4", "mp4"],
]);

/**
 * Load the archived file a 7.0 attachment path points at, as the data: URL
 * the renderer displays.
 *
 * Only the filename of `ref` matters: it is looked up in `imagesDir`, which
 * holds every attachment, videos included. The MIME type comes from the file
 * extension, and unknown extensions load as PNG. Returns null when the file
 * is missing so the caller can drop the dangling reference.
 */
export function readAttachment(imagesDir: string, ref: string): string | null {
    const filename = path.basename(ref);
    if (!filename) return null;

    const fullPath = path.join(imagesDir, filename);

    if (!fs.existsSync(fullPath)) {
        console.warn(`[DECRYPT] Attachment not found: ${fullPath}`);
        return null;
    }

    const extension = path.extname(filename).slice(1).toLowerCase();
    const mimeType = MIME_TYPE_BY_EXTENSION.get(extension) ?? "image/png";

    return `data:${mimeType};base64,${fs.readFileSync(fullPath).toString("base64")}`;
}

/**
 * Decode a data: URL attachment into `imagesDir` as `<baseName>.<extension>`
 * and return the path `data.json` stores for it.
 *
 * The extension comes from the URL's MIME type; MIME types without a mapping
 * are archived as .png. A file already at that name is overwritten.
 */
export function writeAttachment(
    imagesDir: string,
    baseName: string,
    dataUrl: string,
): string {
    const mimeType = dataUrl.slice("data:".length, dataUrl.indexOf(";"));
    const filename = `${baseName}.${EXTENSION_BY_MIME_TYPE.get(mimeType) ?? "png"}`;
    const base64 = dataUrl.slice(dataUrl.indexOf(",") + 1);

    fs.writeFileSync(
        path.join(imagesDir, filename),
        Buffer.from(base64, "base64"),
    );
    return `./_jbfiles/images/${filename}`;
}
