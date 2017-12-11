/* eslint-disable no-undef */
const crypto = require("crypto");
const fs = require("fs");
const owasp = require("owasp-password-strength-test");

// Encryption implemented from https://stackoverflow.com/a/6953606
const algorithm = "aes256";

// Wrapper functions for encryption
// Note: if emojis are to be supported later, might wanna change UTF-8 with UTF-16
exports.getEncryptedText = (text, pwd) => {
    const cipher = crypto.createCipher(algorithm, pwd);
    return cipher.update(text, "utf8", "hex") + cipher.final("hex");
};

exports.getDecryptedText = (text, pwd) => {
    const decipher = crypto.createDecipher(algorithm, pwd);
    try {
        return decipher.update(text, "hex", "utf8") + decipher.final("utf8");
    } catch(ex) {
        $("#prompt").text("Wrong password. Try again.");
        return undefined;
    }
};

exports.checkPwdStrength = (pwd) => {
    owasp.config({
        minLength: 8
    });

    let result = owasp.test(pwd);
    if (result.errors)
        return result.errors;
    else
        return [];
};

exports.encryptFile = (path, outputPath, key, func) => {
    let cipher = crypto.createCipher(algorithm, key);
    let input = fs.createReadStream(path);
    let output = fs.createWriteStream(outputPath);

    input.pipe(cipher).pipe(output);

    output.on("finish", () => {
        func();
    });
};

exports.decryptFile = (path, outputPath, key, func) => {
    let decipher = crypto.createDecipher(algorithm, key);
    let input = fs.createReadStream(path);
    let output = fs.createWriteStream(outputPath);
    try {
        input.pipe(decipher).pipe(output);
        func();
    } catch(ex) {
        func(ex);
    }
};

module.exports = exports;
