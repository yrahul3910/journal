export interface ElectronAPI {
    // Window controls
    minimizeWindow: () => void;
    maximizeWindow: () => void;
    closeWindow: () => void;

    // File operations
    openFileDialog: () => Promise<{
        filePath: string;
        fileVersion: number;
    } | null>;
    saveFileDialog: () => Promise<string | null>;
    decryptJournal: (args: {
        filePath: string;
        password: string;
        fileVersion: number;
    }) => Promise<{ success: boolean; data?: any; error?: string }>;
    saveJournal: (args: {
        filePath: string;
        password: string;
        journalData: any;
    }) => Promise<{ success: boolean; error?: string }>;
    exportHtml: (args: {
        html: string;
    }) => Promise<{ success: boolean; filePath?: string; error?: string }>;
    // Copies a picked file into the open journal and resolves to the URL the
    // renderer loads it from.
    importAttachment: (sourcePath: string) => Promise<string>;
    getPathForFile: (file: File) => string;
    saveImageDialog: () => Promise<string | null>;
    checkPasswordStrength: (password: string) => Promise<string[]>;
}

declare global {
    interface Window {
        electron: ElectronAPI;
    }
}
