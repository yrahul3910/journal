const os = require("os");
const tar = require("tar");

/**
 * Creates an .tar.gz file containing the files in the directory
 * @param {string} directory - The path to the directory with the journal files, to be zipped
 * @param {Function} func - The callback function
 */
exports.compress = (directory, func) => {
    let filename = os.tmpdir() + "/_jb_" + new Date().valueOf() + ".tar.gz";
    tar.create({
        gzip: true,
        file: filename
    }, [directory]).then(() => {
        func();
    });
};

/**
 * Decompresses a .tar.gz file.
 * @param {string} filename - The .tar.gz to uncompress
 * @param {Function} func - The callback function
 */
exports.decompress = (filename, func) => {
    tar.extract({
        file: filename
    }).then(() => {
        func();
    });
};

module.exports = exports;
