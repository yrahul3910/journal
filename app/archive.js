import os from "os";
import tar from "targz";

/**
 * Creates an .tar.gz file containing the files in the directory
 * @param {string} directory - The path to the directory with the journal files, to be zipped
 * @param {Function} func - The callback function
 */
export const compress = (directory, func) => {
    let filename = os.tmpdir() + "/_jb_" + new Date().valueOf() + ".tar.gz";
    tar.compress({
        src: directory,
        dest: filename
    }, (err) => {
        if (err) func(err);
        else func(null, filename);
    });
};

/**
 * Decompresses a .tar.gz file.
 * @param {string} filename - The .tar.gz to uncompress
 * @param {Function} func - The callback function
 */
export const decompress = (filename, func) => {
    tar.decompress({
        src: filename,
        dest: os.tmpdir() + "/_jbfiles",
        tar: {
            fmode: parseInt(777, 8),
            dmode: parseInt(777, 8)
        }
    }, func);
};
