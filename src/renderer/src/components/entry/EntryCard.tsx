import { JournalEntry, SENTIMENT_COLORS } from "@/types/journal";
import { format } from "date-fns";
import { ImageIcon } from "lucide-react";
import { cn } from "@/lib/utils";

interface EntryCardProps {
    entry: JournalEntry;
    isSelected: boolean;
    onClick: () => void;
}

export function EntryCard({ entry, isSelected, onClick }: EntryCardProps) {
    const date = new Date(entry.entryDate);
    const sentimentColor = SENTIMENT_COLORS[entry.sentiment];
    const hasAttachments = entry.attachments && entry.attachments.length > 0;

    // Get preview text (first 100 characters)
    const previewText =
        entry.content.substring(0, 100) +
        (entry.content.length > 100 ? "..." : "");

    return (
        <div
            onClick={onClick}
            role="button"
            tabIndex={0}
            onKeyDown={(e) => {
                if (e.key === "Enter" || e.key === " ") {
                    e.preventDefault();
                    onClick();
                }
            }}
            className={cn(
                "cursor-pointer rounded-lg border p-3 outline-none transition-all hover:bg-accent hover:shadow-sm focus-visible:ring-2 focus-visible:ring-ring/60",
                isSelected
                    ? "border-primary bg-accent shadow-sm ring-1 ring-primary"
                    : "border-border",
            )}
        >
            <div className="flex items-start gap-3">
                {/* Sentiment indicator */}
                <div
                    className="mt-1 h-3 w-3 rounded-full flex-shrink-0"
                    style={{ backgroundColor: sentimentColor }}
                    title={entry.sentiment}
                />

                <div className="flex-1 min-w-0">
                    {/* Date */}
                    <div className="flex items-center gap-2 mb-1">
                        <p className="text-sm font-semibold">
                            {format(date, "MMM dd, yyyy")}
                        </p>
                        {entry.nsfw && (
                            <span className="text-xs bg-red-500 text-white px-1.5 py-0.5 rounded">
                                NSFW
                            </span>
                        )}
                        {hasAttachments && (
                            <ImageIcon className="h-3 w-3 text-muted-foreground" />
                        )}
                    </div>

                    {/* Preview */}
                    <p className="text-xs text-muted-foreground line-clamp-2">
                        {previewText}
                    </p>
                </div>
            </div>
        </div>
    );
}
