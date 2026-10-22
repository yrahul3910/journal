import {
    createCipheriv,
    createDecipheriv,
    createHash,
    createHmac,
    type Hash,
    hkdfSync,
    randomBytes,
    scrypt,
    timingSafeEqual,
} from "node:crypto";
import fs from "node:fs";
import { pipeline } from "node:stream/promises";

// The encrypted journal container of format 7.1, specified in
// journal-format-7.1.md at the repository root.

const MAGIC = Buffer.from("JBEARENC", "ascii");
const CONTAINER_VERSION = 1;
const KDF_SCRYPT = 1;
// Writers' scrypt settings: N = 2^17, r = 8, p = 1, or 128 MiB per derivation.
const SCRYPT_LOG2N = 17;
const SCRYPT_R = 8;
const SCRYPT_P = 1;
// Node refuses N = 2^18 with r = 8 at exactly 256 MiB, so leave headroom.
const SCRYPT_MAX_MEMORY = 257 * 1024 * 1024;
const SALT_LENGTH = 16;
const PAYLOAD_NONCE_LENGTH = 16;
const HEADER_BODY_LENGTH = 45; // the header bytes the header MAC covers
const HEADER_LENGTH = 77;
const TAG_LENGTH = 16;
const CHUNK_LENGTH = 65536;
const SEALED_CHUNK_LENGTH = CHUNK_LENGTH + TAG_LENGTH;

export type ContainerFailure = "wrongPassword" | "damaged" | "newerVersion";

/** Why a 7.1 journal could not be opened, in terms the user can act on. */
export class ContainerError extends Error {
    constructor(readonly failure: ContainerFailure) {
        super(failure);
    }
}

interface ScryptSettings {
    log2N: number;
    r: number;
    p: number;
    salt: Buffer;
}

/** The random inputs of one save. Tests fix them to compare against known answers. */
export interface SealRandomness {
    salt: Buffer;
    payloadNonce: Buffer;
}

function deriveFileKey(
    password: string,
    settings: ScryptSettings,
): Promise<Buffer> {
    // NFC so every app turns the same visible password into the same bytes.
    const passwordBytes = Buffer.from(password.normalize("NFC"), "utf8");
    const options = {
        N: 2 ** settings.log2N,
        r: settings.r,
        p: settings.p,
        maxmem: SCRYPT_MAX_MEMORY,
    };

    return new Promise((resolve, reject) => {
        scrypt(passwordBytes, settings.salt, 32, options, (error, key) =>
            error ? reject(error) : resolve(key),
        );
    });
}

function headerMac(fileKey: Buffer, headerBody: Buffer): Buffer {
    const headerKey = hkdfSync(
        "sha256",
        fileKey,
        Buffer.alloc(0),
        "JournalBear 7.1 header",
        32,
    );
    return createHmac("sha256", Buffer.from(headerKey))
        .update(headerBody)
        .digest();
}

function payloadKey(fileKey: Buffer, payloadNonce: Buffer): Buffer {
    return Buffer.from(
        hkdfSync(
            "sha256",
            fileKey,
            payloadNonce,
            "JournalBear 7.1 payload",
            32,
        ),
    );
}

// An 11-byte big-endian chunk counter followed by the last-chunk flag.
function chunkNonce(index: number, isLast: boolean): Buffer {
    const nonce = Buffer.alloc(12);
    nonce.writeUIntBE(index, 5, 6);
    nonce[11] = isLast ? 1 : 0;

    return nonce;
}

function sealChunk(
    key: Buffer,
    index: number,
    chunk: Buffer,
    isLast: boolean,
): Buffer {
    const cipher = createCipheriv(
        "aes-256-gcm",
        key,
        chunkNonce(index, isLast),
        { authTagLength: TAG_LENGTH },
    );

    return Buffer.concat([
        cipher.update(chunk),
        cipher.final(),
        cipher.getAuthTag(),
    ]);
}

function openChunk(
    key: Buffer,
    index: number,
    sealed: Buffer,
    isLast: boolean,
): Buffer {
    const decipher = createDecipheriv(
        "aes-256-gcm",
        key,
        chunkNonce(index, isLast),
        { authTagLength: TAG_LENGTH },
    );
    decipher.setAuthTag(sealed.subarray(sealed.length - TAG_LENGTH));

    try {
        return Buffer.concat([
            decipher.update(sealed.subarray(0, sealed.length - TAG_LENGTH)),
            decipher.final(),
        ]);
    } catch {
        throw new ContainerError("damaged");
    }
}

// Yields the header, then the plaintext sealed in 64 KiB chunks, hashing the
// plaintext as it goes. A chunk is known not to be the last only once more
// input follows it, so one chunk is always held back until then.
async function* sealChunks(
    plaintext: AsyncIterable<Buffer>,
    header: Buffer,
    key: Buffer,
    plaintextHash: Hash,
): AsyncGenerator<Buffer> {
    let pending = Buffer.alloc(0);
    let index = 0;

    yield header;

    for await (const data of plaintext) {
        plaintextHash.update(data);
        pending = Buffer.concat([pending, data]);

        while (pending.length > CHUNK_LENGTH) {
            yield sealChunk(
                key,
                index++,
                pending.subarray(0, CHUNK_LENGTH),
                false,
            );
            pending = pending.subarray(CHUNK_LENGTH);
        }
    }

    yield sealChunk(key, index, pending, true);
}

// Yields the plaintext of the chunks in the file at `path`, each only after
// its tag verifies, with the same one-chunk lookahead to recognize the last.
// Nothing is opened until the first chunk is requested.
async function* openChunks(path: string, key: Buffer): AsyncGenerator<Buffer> {
    let pending = Buffer.alloc(0);
    let index = 0;

    for await (const data of fs.createReadStream(path, {
        start: HEADER_LENGTH,
    })) {
        pending = Buffer.concat([pending, data]);

        while (pending.length > SEALED_CHUNK_LENGTH) {
            const sealed = pending.subarray(0, SEALED_CHUNK_LENGTH);
            yield openChunk(key, index++, sealed, false);
            pending = pending.subarray(SEALED_CHUNK_LENGTH);
        }
    }

    // The last chunk needs at least a tag, and may be empty only when it is
    // the only chunk.
    const isTooShort =
        pending.length < TAG_LENGTH ||
        (pending.length === TAG_LENGTH && index > 0);
    if (isTooShort) throw new ContainerError("damaged");

    yield openChunk(key, index, pending, true);
}

/**
 * Read the settings a header claims without trusting them: the header MAC can
 * only be checked once scrypt has run with these settings, so anything this
 * reader does not support is refused first, before it can cost memory.
 */
function parseHeader(header: Buffer) {
    // Opening checks the magic before it gets here; verifying a save does not.
    if (!header.subarray(0, MAGIC.length).equals(MAGIC)) {
        throw new ContainerError("damaged");
    }

    const [containerVersion, kdfId, log2N, r, p] = header.subarray(8, 13);
    const isSupported =
        containerVersion === CONTAINER_VERSION &&
        kdfId === KDF_SCRYPT &&
        (log2N === 17 || log2N === 18) &&
        r === 8 &&
        p === 1;
    if (!isSupported) throw new ContainerError("newerVersion");

    return {
        settings: { log2N, r, p, salt: header.subarray(13, 29) },
        payloadNonce: header.subarray(29, HEADER_BODY_LENGTH),
        mac: header.subarray(HEADER_BODY_LENGTH, HEADER_LENGTH),
    };
}

/**
 * Encrypt the file at `inputPath` into `outputPath` as a 7.1 journal under
 * `password`, with the writers' scrypt settings. Resolves to the SHA-256 of
 * the plaintext, which `verifyContainer` checks the written file against.
 *
 * Neither file is opened until the key is derived. If sealing fails,
 * `outputPath` may hold a partial file for the caller to remove.
 */
export async function sealContainer(
    inputPath: string,
    outputPath: string,
    password: string,
    randomness: SealRandomness = {
        salt: randomBytes(SALT_LENGTH),
        payloadNonce: randomBytes(PAYLOAD_NONCE_LENGTH),
    },
): Promise<Buffer> {
    const settings = {
        log2N: SCRYPT_LOG2N,
        r: SCRYPT_R,
        p: SCRYPT_P,
        salt: randomness.salt,
    };
    const fileKey = await deriveFileKey(password, settings);
    const body = Buffer.concat([
        MAGIC,
        Buffer.from([
            CONTAINER_VERSION,
            KDF_SCRYPT,
            SCRYPT_LOG2N,
            SCRYPT_R,
            SCRYPT_P,
        ]),
        randomness.salt,
        randomness.payloadNonce,
    ]);
    const header = Buffer.concat([body, headerMac(fileKey, body)]);
    const key = payloadKey(fileKey, randomness.payloadNonce);
    const plaintextHash = createHash("sha256");

    await pipeline(
        fs.createReadStream(inputPath),
        (plaintext: AsyncIterable<Buffer>) =>
            sealChunks(plaintext, header, key, plaintextHash),
        fs.createWriteStream(outputPath),
    );

    return plaintextHash.digest();
}

/** Whether the file at `path` is a 7.1 container rather than a legacy journal. */
export async function isContainer(path: string): Promise<boolean> {
    const start = Buffer.alloc(MAGIC.length);
    const file = await fs.promises.open(path);

    try {
        const { bytesRead } = await file.read(start, 0, MAGIC.length, 0);
        return bytesRead === MAGIC.length && start.equals(MAGIC);
    } finally {
        await file.close();
    }
}

/**
 * Check the header of the 7.1 journal at `path` against `password` and
 * resolve to its plaintext, read lazily from the file in verified chunks.
 *
 * Rejects with a `ContainerError`: `damaged` for a file too short to hold a
 * header and one tag or without the 7.1 magic, `newerVersion` for a container
 * version, KDF, or scrypt settings this reader does not support (checked
 * before scrypt runs), and `wrongPassword` when the header MAC fails.
 * Iterating the result throws `ContainerError("damaged")` at the first
 * truncated, extended, or modified chunk, before any of that chunk's plaintext
 * is yielded. Other errors, such as I/O failures, pass through unchanged.
 */
export async function openContainer(
    path: string,
    password: string,
): Promise<AsyncIterable<Buffer>> {
    const header = Buffer.alloc(HEADER_LENGTH);
    const file = await fs.promises.open(path);

    try {
        // The smallest valid journal is a header and one empty chunk's tag.
        const { size } = await file.stat();
        if (size < HEADER_LENGTH + TAG_LENGTH) {
            throw new ContainerError("damaged");
        }

        await file.read(header, 0, HEADER_LENGTH, 0);
    } finally {
        await file.close();
    }

    const { settings, payloadNonce, mac } = parseHeader(header);
    const fileKey = await deriveFileKey(password, settings);
    const expectedMac = headerMac(
        fileKey,
        header.subarray(0, HEADER_BODY_LENGTH),
    );
    if (!timingSafeEqual(expectedMac, mac)) {
        throw new ContainerError("wrongPassword");
    }

    return openChunks(path, payloadKey(fileKey, payloadNonce));
}

/**
 * Reopen the journal at `path` exactly as opening it would, deriving the key
 * from the header written there, and check that it decrypts to plaintext with
 * SHA-256 `expectedHash`. Throws if it does not, so a save can refuse to
 * replace the previous file with one nobody could open; a `ContainerError`
 * from reopening is wrapped in an error whose message suits a failed save.
 */
export async function verifyContainer(
    path: string,
    password: string,
    expectedHash: Buffer,
): Promise<void> {
    const hash = createHash("sha256");
    const message =
        "The journal could not be saved: the new file did not reopen correctly.";

    try {
        for await (const chunk of await openContainer(path, password)) {
            hash.update(chunk);
        }
    } catch (error) {
        if (!(error instanceof ContainerError)) throw error;
        throw new Error(message, { cause: error });
    }

    if (!hash.digest().equals(expectedHash)) throw new Error(message);
}
