import {
    DropdownMenu,
    DropdownMenuContent,
    DropdownMenuItem,
    DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { useJournalStore } from "@/store/journal-store";
import { saveJournal, exportToHTML } from "@/lib/journal-io";
import { toast } from "sonner";
import { Minus, Moon, Square, Sun, X } from "lucide-react";
import { useState } from "react";

type MenuName = "file" | "entry" | "preferences" | "help";

export function MenuBar() {
    const { journalData, openDialog, theme, setTheme } = useJournalStore();

    // Track which menu is open so hovering a sibling trigger switches to it
    // (only once a menu has been opened by clicking).
    const [openMenu, setOpenMenu] = useState<MenuName | null>(null);

    const menuProps = (name: MenuName) => ({
        // modal={false} keeps pointer events alive outside the open menu so that
        // hovering a sibling trigger can switch menus.
        modal: false,
        open: openMenu === name,
        onOpenChange: (open: boolean) => setOpenMenu(open ? name : null),
    });

    // When switching menus on hover, the closing menu's default auto-focus would
    // pull focus back to its own trigger, which the newly opened menu reads as a
    // "focus outside" event and closes itself. Suppressing it stops the flicker.
    const menuContentProps = {
        onCloseAutoFocus: (e: Event) => e.preventDefault(),
    };

    const triggerHoverProps = (name: MenuName) => ({
        onMouseEnter: () => {
            // Switch menus on hover only when a menu is already open.
            if (openMenu !== null && openMenu !== name) setOpenMenu(name);
        },
    });

    const toggleTheme = () => {
        const newTheme = theme === "dark" ? "light" : "dark";
        setTheme(newTheme);
        localStorage.setItem("theme", newTheme);
        localStorage.setItem("lastThemeChange", Date.now().toString());
    };

    const handleMinimize = () => {
        window.electron.minimizeWindow();
    };

    const handleMaximize = () => {
        window.electron.maximizeWindow();
    };

    const handleClose = () => {
        window.electron.closeWindow();
    };

    const handleNewJournal = () => {
        openDialog("newJournal");
    };

    const handleOpen = async () => {
        const result = await window.electron.openFileDialog();
        if (result) {
            useJournalStore.setState({
                currentFilePath: result.filePath,
                currentFileVersion: result.fileVersion,
                encryptedData: result.encryptedData,
                viewMode: "journal",
            });
            openDialog("decrypt");
        }
    };

    const handleSave = async () => {
        if (!journalData) {
            toast.error("No journal is open.");
            return;
        }

        const toastId = toast.loading("Saving journal...");
        const result = await saveJournal();

        if (result.success) {
            toast.success("Journal saved successfully!", { id: toastId });
        } else {
            toast.error(result.error || "Failed to save journal", {
                id: toastId,
            });
        }
    };

    const handleExport = async () => {
        if (!journalData) {
            toast.error("No journal is open.");
            return;
        }

        const toastId = toast.loading("Exporting to HTML...");
        const result = await exportToHTML();

        if (result.success) {
            toast.success("Exported successfully!", { id: toastId });
        } else {
            toast.error(result.error || "Failed to export journal", {
                id: toastId,
            });
        }
    };

    const handleNewEntry = () => {
        if (!journalData) {
            toast.error("No journal is open.");
            return;
        }
        useJournalStore.setState({
            isNewEntry: true,
            editingEntry: null,
            encodedImages: [],
        });
        openDialog("edit");
    };

    const handleUpdateEntry = () => {
        if (!journalData) {
            toast.error("No journal is open.");
            return;
        }
        const { selectedEntry, selectedEntryIndex } =
            useJournalStore.getState();
        if (!selectedEntry || selectedEntryIndex === null) {
            toast.error("Please select an entry to update.");
            return;
        }
        useJournalStore.setState({
            isNewEntry: false,
            editingEntry: selectedEntry,
            encodedImages: selectedEntry.attachments || [],
        });
        openDialog("edit");
    };

    const handleSearch = () => {
        if (!journalData) {
            toast.error("No journal is open.");
            return;
        }
        openDialog("search");
    };

    const handleStatistics = () => {
        if (!journalData) {
            toast.error("No journal is open.");
            return;
        }
        openDialog("statistics");
    };

    const handleChangePassword = () => {
        if (!journalData) {
            toast.error("No journal is open.");
            return;
        }
        // TODO: Implement password change dialog
        toast.info("Password change feature coming soon!");
    };

    const handleAbout = () => {
        openDialog("about");
    };

    const handleIntro = () => {
        openDialog("intro");
    };

    const menuTriggerClass =
        "px-3 py-1.5 text-xs rounded text-white outline-none transition-colors hover:bg-white/10 focus-visible:bg-white/10 data-[state=open]:bg-white/10";

    return (
        <div className="titlebar-drag flex h-10 items-center justify-between bg-black text-white px-4">
            {/* Left side: App name + menus */}
            <div className="titlebar-no-drag flex items-center gap-4">
                <div className="text-sm font-bold">JournalBear</div>
                <div className="flex gap-1">
                    {/* File Menu */}
                    <DropdownMenu {...menuProps("file")}>
                        <DropdownMenuTrigger
                            className={menuTriggerClass}
                            {...triggerHoverProps("file")}
                        >
                            File
                        </DropdownMenuTrigger>
                        <DropdownMenuContent {...menuContentProps}>
                            <DropdownMenuItem onClick={handleNewJournal}>
                                New Journal
                            </DropdownMenuItem>
                            <DropdownMenuItem onClick={handleOpen}>
                                Open
                            </DropdownMenuItem>
                            <DropdownMenuItem onClick={handleSave}>
                                Save
                            </DropdownMenuItem>
                            <DropdownMenuItem onClick={handleExport}>
                                Export to HTML
                            </DropdownMenuItem>
                        </DropdownMenuContent>
                    </DropdownMenu>

                    {/* Entry Menu */}
                    <DropdownMenu {...menuProps("entry")}>
                        <DropdownMenuTrigger
                            className={menuTriggerClass}
                            {...triggerHoverProps("entry")}
                        >
                            Entry
                        </DropdownMenuTrigger>
                        <DropdownMenuContent {...menuContentProps}>
                            <DropdownMenuItem onClick={handleNewEntry}>
                                New Entry
                            </DropdownMenuItem>
                            <DropdownMenuItem onClick={handleUpdateEntry}>
                                Update Entry
                            </DropdownMenuItem>
                            <DropdownMenuItem onClick={handleSearch}>
                                Search
                            </DropdownMenuItem>
                            <DropdownMenuItem onClick={handleStatistics}>
                                Your Statistics
                            </DropdownMenuItem>
                        </DropdownMenuContent>
                    </DropdownMenu>

                    {/* Preferences Menu */}
                    <DropdownMenu {...menuProps("preferences")}>
                        <DropdownMenuTrigger
                            className={menuTriggerClass}
                            {...triggerHoverProps("preferences")}
                        >
                            Preferences
                        </DropdownMenuTrigger>
                        <DropdownMenuContent {...menuContentProps}>
                            <DropdownMenuItem onClick={handleChangePassword}>
                                Change Password
                            </DropdownMenuItem>
                        </DropdownMenuContent>
                    </DropdownMenu>

                    {/* Help Menu */}
                    <DropdownMenu {...menuProps("help")}>
                        <DropdownMenuTrigger
                            className={menuTriggerClass}
                            {...triggerHoverProps("help")}
                        >
                            Help
                        </DropdownMenuTrigger>
                        <DropdownMenuContent {...menuContentProps}>
                            <DropdownMenuItem onClick={handleAbout}>
                                About
                            </DropdownMenuItem>
                            <DropdownMenuItem onClick={handleIntro}>
                                Getting Started
                            </DropdownMenuItem>
                            <DropdownMenuItem asChild>
                                <a
                                    href="https://journalbear.wordpress.com/2017/12/02/markdown-formatting/"
                                    target="_blank"
                                    rel="noopener noreferrer"
                                >
                                    Markdown formatting help
                                </a>
                            </DropdownMenuItem>
                            <DropdownMenuItem asChild>
                                <a
                                    href="https://journalbear.wordpress.com/contact/"
                                    target="_blank"
                                    rel="noopener noreferrer"
                                >
                                    Contact Us
                                </a>
                            </DropdownMenuItem>
                        </DropdownMenuContent>
                    </DropdownMenu>
                </div>
            </div>

            {/* Right side: Theme toggle + window controls */}
            <div className="titlebar-no-drag flex items-center gap-2">
                <button
                    onClick={toggleTheme}
                    className="mr-1 flex h-6 w-6 items-center justify-center rounded outline-none transition-colors hover:bg-white/10 focus-visible:bg-white/10"
                    aria-label={
                        theme === "dark"
                            ? "Switch to light mode"
                            : "Switch to dark mode"
                    }
                    title={
                        theme === "dark"
                            ? "Switch to light mode"
                            : "Switch to dark mode"
                    }
                >
                    {theme === "dark" ? (
                        <Sun className="h-4 w-4" />
                    ) : (
                        <Moon className="h-4 w-4" />
                    )}
                </button>
                <button
                    onClick={handleMinimize}
                    className="flex h-6 w-6 items-center justify-center rounded outline-none transition-colors hover:bg-white/10 focus-visible:bg-white/10"
                    aria-label="Minimize"
                >
                    <Minus className="h-4 w-4" />
                </button>
                <button
                    onClick={handleMaximize}
                    className="flex h-6 w-6 items-center justify-center rounded outline-none transition-colors hover:bg-white/10 focus-visible:bg-white/10"
                    aria-label="Maximize"
                >
                    <Square className="h-3 w-3" />
                </button>
                <button
                    onClick={handleClose}
                    className="flex h-6 w-6 items-center justify-center rounded outline-none transition-colors hover:bg-red-600 focus-visible:bg-red-600"
                    aria-label="Close"
                >
                    <X className="h-4 w-4" />
                </button>
            </div>
        </div>
    );
}
