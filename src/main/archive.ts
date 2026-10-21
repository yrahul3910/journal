import fs from "fs";
import * as tar from "tar";

/**
 * Creates a .tar.gz file containing the files in the directory
 * @param directory - The path to the directory with the journal files, to be zipped
 * @param filename - Where to write the .tar.gz
 */
export const compress = async (
    directory: string,
    filename: string,
): Promise<void> => {
    await tar.c(
        {
            z: true,
            f: filename,
            cwd: directory,
        },
        fs.readdirSync(directory),
    );
};

/**
 * Decompresses a .tar.gz file into `directory`, emptying it first.
 * @param filename - The .tar.gz to uncompress
 * @param directory - Where to extract it
 */
export const decompress = async (
    filename: string,
    directory: string,
): Promise<void> => {
    fs.rmSync(directory, { recursive: true, force: true });
    fs.mkdirSync(directory, { recursive: true });

    await tar.x({
        f: filename,
        C: directory,
    });
};
