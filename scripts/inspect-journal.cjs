// Read-only journal inspector. Decrypts a .zjournal, extracts it, and reports
// entry/attachment counts and total image bytes so two files can be compared.
//
//   node scripts/inspect-journal.cjs <file.zjournal> <password>
//
// Nothing is written back to your journal; it only extracts to a temp dir.

const crypto = require("crypto");
const fs = require("fs");
const os = require("os");
const path = require("path");
const tar = require("tar");

const SALT_LENGTH = 16;
const IV_LENGTH = 16;
const KEY_LENGTH = 32;

async function main() {
    const [file, password] = process.argv.slice(2);
    if (!file || !password) {
        console.error("usage: node scripts/inspect-journal.cjs <file> <password>");
        process.exit(1);
    }

    const buf = fs.readFileSync(file);
    const salt = buf.subarray(0, SALT_LENGTH);
    const iv = buf.subarray(SALT_LENGTH, SALT_LENGTH + IV_LENGTH);
    const enc = buf.subarray(SALT_LENGTH + IV_LENGTH);
    const key = crypto.pbkdf2Sync(password, salt, 100000, KEY_LENGTH, "sha256");
    const decipher = crypto.createDecipheriv("aes-256-cbc", key, iv);
    const targz = Buffer.concat([decipher.update(enc), decipher.final()]);

    const out = fs.mkdtempSync(path.join(os.tmpdir(), "jb-inspect-"));
    const archivePath = path.join(out, "j.tar.gz");
    fs.writeFileSync(archivePath, targz);
    await tar.x({ f: archivePath, C: out });

    // data.json may be at the root or nested under a stray absolute-path tree
    // (the layout bug). Find it wherever it landed.
    const jsonPath = findFile(out, "data.json") || findFile(out, "journal.json");
    if (!jsonPath) {
        console.error("could not find data.json/journal.json in archive");
        console.error("top-level entries:", fs.readdirSync(out));
        process.exit(2);
    }
    const imagesRoot = path.dirname(jsonPath);
    const data = JSON.parse(fs.readFileSync(jsonPath, "utf8"));
    const entries = data.entries || data.en || [];

    let attachmentCount = 0;
    let imageBytes = 0;
    const suspicious = [];

    entries.forEach((entry, idx) => {
        const raw = entry.attachments ?? entry.attachment;
        if (raw == null) return;
        const list = Array.isArray(raw) ? raw : [raw];
        list.forEach((att, j) => {
            if (typeof att !== "string" || !att.trim()) return;
            attachmentCount++;
            let bytes;
            if (att.startsWith("data:image/") || att.length > 512) {
                // inline base64 (5.1)
                const b64 = att.replace(/^data:image\/\w+;base64,/, "");
                bytes = Buffer.from(b64, "base64").length;
            } else {
                // file path (7.0) -> read the actual file
                const name = att.split("/").pop();
                const p = path.join(imagesRoot, "images", name);
                bytes = fs.existsSync(p) ? fs.statSync(p).size : 0;
                if (!fs.existsSync(p)) suspicious.push(`entry ${idx}[${j}] missing file: ${att}`);
            }
            imageBytes += bytes;
            if (bytes < 1024) suspicious.push(`entry ${idx}[${j}] tiny attachment: ${bytes} bytes`);
        });
    });

    console.log("file:            ", file);
    console.log("archive bytes:   ", targz.length.toLocaleString());
    console.log("data.json at:    ", path.relative(out, jsonPath));
    console.log("entries:         ", entries.length);
    console.log("attachments:     ", attachmentCount);
    console.log("total image bytes:", imageBytes.toLocaleString());
    if (suspicious.length) {
        console.log("\nSUSPICIOUS (" + suspicious.length + "):");
        suspicious.slice(0, 40).forEach((s) => console.log("  - " + s));
        if (suspicious.length > 40) console.log("  ... and " + (suspicious.length - 40) + " more");
    } else {
        console.log("\nno tiny/missing attachments detected");
    }

    fs.rmSync(out, { recursive: true, force: true });
}

function findFile(dir, name) {
    for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
        const p = path.join(dir, e.name);
        if (e.isFile() && e.name === name) return p;
        if (e.isDirectory()) {
            const found = findFile(p, name);
            if (found) return found;
        }
    }
    return null;
}

main().catch((e) => {
    console.error(e);
    process.exit(1);
});
