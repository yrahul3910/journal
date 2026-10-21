import { useEffect, useState, useRef } from "react";
import { Upload, Video, X } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { isVideo } from "@/lib/attachments";

// Limited to the containers the SwiftUI app can also play; AVFoundation can't
// play WebM or most others.
const VIDEO_TYPES = ["video/mp4", "video/quicktime"];

interface FileDropZoneProps {
    files: string[]; // attachment URLs
    // Imports finish after the user may have added or removed other files, so
    // new attachments are handed over to append rather than as a full list.
    onAdd: (files: string[]) => void;
    onRemove: (index: number) => void;
    onImportingChange: (isImporting: boolean) => void;
}

export function FileDropZone({
    files,
    onAdd,
    onRemove,
    onImportingChange,
}: FileDropZoneProps) {
    const [isDragging, setIsDragging] = useState(false);
    const fileInputRef = useRef<HTMLInputElement>(null);
    const pendingImports = useRef(new Set<AbortController>());

    useEffect(() => {
        const imports = pendingImports.current;

        // An import still running when the editor closes must not land in
        // whichever entry is edited next.
        return () => {
            for (const batch of imports) batch.abort();
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
        const accepted: string[] = [];

        for (const file of fileList) {
            const sourcePath = window.electron.getPathForFile(file);
            const reason = rejectionReason(file, sourcePath);

            if (reason) {
                toast.error(reason);
            } else {
                accepted.push(sourcePath);
            }
        }

        if (accepted.length === 0) return;

        const batch = new AbortController();
        pendingImports.current.add(batch);
        onImportingChange(true);

        // The main process copies each file into the open journal; the
        // renderer only ever holds the URL it hands back.
        const results = await Promise.allSettled(
            accepted.map((sourcePath) =>
                window.electron.importAttachment(sourcePath),
            ),
        );
        pendingImports.current.delete(batch);
        if (batch.signal.aborted) return;

        const added = results.flatMap((result) =>
            result.status === "fulfilled" ? [result.value] : [],
        );

        if (added.length > 0) onAdd(added);
        if (added.length < accepted.length) {
            toast.error("Couldn't add one or more of the selected files.");
        }

        onImportingChange(pendingImports.current.size > 0);
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

// Why `file` can't be attached, or null when it can. `sourcePath` is empty
// for a file that exists only in memory, such as an image dragged from a web
// page, which the main process has nothing to copy from.
function rejectionReason(file: File, sourcePath: string): string | null {
    if (!file.type.startsWith("image/") && !VIDEO_TYPES.includes(file.type)) {
        return `${file.name} isn't an image or an MP4 or MOV video.`;
    }

    return sourcePath
        ? null
        : `${file.name} isn't saved on this computer. Save it, then attach the file.`;
}
