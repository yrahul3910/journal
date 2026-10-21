/**
 * Whether an attachment is a video. Attachments are journalbear: URLs ending
 * in their archive filename, where .mp4 and .mov are videos, or inline data:
 * URLs from migrated 5.1 journals, which are always images.
 */
export function isVideo(attachment: string): boolean {
    return /\.(mp4|mov)$/i.test(attachment);
}
