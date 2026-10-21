import { useEffect, useState, useRef } from "react";
import { Upload, Video, X } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { isVideo } from "@/lib/attachments";

// Limited to the containers the SwiftUI app can also play; AVFoundation can't
// play WebM or most others.
const VIDEO_TYPES = ["video/mp4", "video/quicktime"];

// Each attachment travels as one base64 string, and V8 caps strings at about
// 512M characters (roughly 380 MB of video). The SwiftUI app enforces the
// same limit so every journal stays openable here.
const MAX_VIDEO_BYTES = 256 * 1024 * 1024;

interface FileDropZoneProps {
    files: string[]; // attachments as data: URLs
    // Reads finish after the user may have added or removed other files, so
    // new attachments are handed over to append rather than as a full list.
    onAdd: (files: string[]) => void;
    onRemove: (index: number) => void;
    onReadingChange: (isReading: boolean) => void;
}

export function FileDropZone({
    files,
    onAdd,
    onRemove,
    onReadingChange,
}: FileDropZoneProps) {
    const [isDragging, setIsDragging] = useState(false);
    const fileInputRef = useRef<HTMLInputElement>(null);
    const pendingReads = useRef(new Set<AbortController>());

    useEffect(() => {
        const reads = pendingReads.current;

        // A read still running when the editor closes must not land in
        // whichever entry is edited next.
        return () => {
            for (const read of reads) read.abort();
        };
    }, []);

    const handleDragOver = (e: React.DragEvent) => {
        e.preventDefault();
        setIsDragging(true);
    };

    const handleDragLeave = (e: React.DragEvent) => {
        e.preventDefault();
        setIsDragging(false);
    };

    const handleDrop = async (e: React.DragEvent) => {
        e.preventDefault();
        setIsDragging(false);

        const droppedFiles = Array.from(e.dataTransfer.files);
        await processFiles(droppedFiles);
    };

    const handleFileSelect = async (e: React.ChangeEvent<HTMLInputElement>) => {
        if (e.target.files) {
            const selectedFiles = Array.from(e.target.files);
            await processFiles(selectedFiles);
        }
    };

    const processFiles = async (fileList: File[]) => {
        const accepted: File[] = [];

        for (const file of fileList) {
            const reason = rejectionReason(file);

            if (reason) {
                toast.error(reason);
            } else {
                accepted.push(file);
            }
        }

        if (accepted.length === 0) return;

        const read = new AbortController();
        pendingReads.current.add(read);
        onReadingChange(true);

        const results = await Promise.allSettled(
            accepted.map((file) => readAsDataUrl(file, read.signal)),
        );
        pendingReads.current.delete(read);
        if (read.signal.aborted) return;

        const added = results.flatMap((result) =>
            result.status === "fulfilled" ? [result.value] : [],
        );

        if (added.length > 0) onAdd(added);
        if (added.length < accepted.length) {
            toast.error("Couldn't read one or more of the selected files.");
        }

        onReadingChange(pendingReads.current.size > 0);
    };

    const handleClick = () => {
        fileInputRef.current?.click();
    };

    return (
        <div className="space-y-4">
            <div
                onDragOver={handleDragOver}
                onDragLeave={handleDragLeave}
                onDrop={handleDrop}
                onClick={handleClick}
                className={`border-2 border-dashed rounded-lg p-8 text-center cursor-pointer transition-colors ${
                    isDragging
                        ? "border-primary bg-primary/10"
                        : "border-muted-foreground/25 hover:border-primary/50"
                }`}
            >
                <input
                    ref={fileInputRef}
                    type="file"
                    accept={["image/*", ...VIDEO_TYPES].join(",")}
                    multiple
                    onChange={handleFileSelect}
                    className="hidden"
                />
                <Upload className="h-8 w-8 mx-auto mb-2 text-muted-foreground" />
                <p className="text-sm text-muted-foreground">
                    Drag and drop images or MP4/MOV videos here, or click to
                    browse
                </p>
            </div>

            {files.length > 0 && (
                <div className="grid grid-cols-3 gap-4">
                    {files.map((file, index) => (
                        <div key={index} className="relative group">
                            {isVideo(file) ? (
                                <>
                                    <video
                                        src={file}
                                        muted
                                        preload="metadata"
                                        aria-label={`Attachment ${index + 1}`}
                                        className="w-full h-32 object-cover rounded-lg border"
                                    />
                                    <Video className="absolute bottom-2 left-2 h-4 w-4 text-white drop-shadow" />
                                </>
                            ) : (
                                <img
                                    src={file}
                                    alt={`Attachment ${index + 1}`}
                                    className="w-full h-32 object-cover rounded-lg border"
                                />
                            )}
                            <Button
                                variant="destructive"
                                size="icon"
                                className="absolute top-2 right-2 opacity-0 group-hover:opacity-100 transition-opacity h-6 w-6"
                                onClick={(e) => {
                                    e.stopPropagation();
                                    onRemove(index);
                                }}
                            >
                                <X className="h-4 w-4" />
                            </Button>
                        </div>
                    ))}
                </div>
            )}
        </div>
    );
}

// Why `file` can't be attached, or null when it can.
function rejectionReason(file: File): string | null {
    if (VIDEO_TYPES.includes(file.type)) {
        return file.size > MAX_VIDEO_BYTES
            ? `${file.name} is larger than 256 MB.`
            : null;
    }

    return file.type.startsWith("image/")
        ? null
        : `${file.name} isn't an image or an MP4 or MOV video.`;
}

function readAsDataUrl(file: File, signal: AbortSignal): Promise<string> {
    return new Promise((resolve, reject) => {
        const reader = new FileReader();
        // SAFETY: readAsDataURL always produces a string result.
        reader.onload = () => resolve(reader.result as string);
        reader.onerror = () => reject(reader.error);

        signal.addEventListener("abort", () => {
            reader.abort();
            reject(signal.reason);
        });

        // Chromium only plays MOV when it is labeled as MP4, the same
        // container family.
        reader.readAsDataURL(
            VIDEO_TYPES.includes(file.type)
                ? new Blob([file], { type: "video/mp4" })
                : file,
        );
    });
}
