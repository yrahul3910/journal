import os from "os";
import fs from "fs";
import * as tar from "tar";

/**
 * Creates an .tar.gz file containing the files in the directory
 * @param directory - The path to the directory with the journal files, to be zipped
 * @param func - The callback function
 */
export const compress = async (directory: string): Promise<string> => {
    const filename = `${os.tmpdir()}/_jb_${Date.now()}.tar.gz`;
    await tar.c(
        {
            z: true,
            f: filename,
            cwd: directory,
        },
        fs.readdirSync(directory),
    );

    return filename;
};

/**
 * Decompresses a .tar.gz file into a fresh `_jbfiles` directory.
 * @param filename - The .tar.gz to uncompress
 */
export const decompress = async (filename: string): Promise<void> => {
    const directory = `${os.tmpdir()}/_jbfiles`;

    fs.rmSync(directory, { recursive: true, force: true });
    fs.mkdirSync(directory, { recursive: true });

    await tar.x({
        f: filename,
        C: directory,
    });
};
