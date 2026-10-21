/**
 * Whether an in-memory attachment (always a data: URL) is a video. Videos are
 * held as video/mp4 whatever their source container; see FileDropZone.
 */
export function isVideo(attachment: string): boolean {
    return attachment.startsWith("data:video/");
}
