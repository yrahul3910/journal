import { createCipheriv, createHash } from "node:crypto";
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";

import { afterAll, beforeAll, describe, expect, it } from "vitest";

import {
    type ContainerFailure,
    openContainer,
    type SealRandomness,
    sealContainer,
    verifyContainer,
} from "./container";

const PASSWORD = "correct horse battery staple";
const HEADER_LENGTH = 77;
const SEALED_CHUNK_LENGTH = 65536 + 16;

interface Vector {
    name: string;
    password: string;
    kdfSalt: string;
    payloadNonce: string;
    payloadLength: number;
    fileKey: string;
    payloadKey: string;
    headerHex: string;
    fileSha256: string;
    fileHex?: string;
}

const vectors: Vector[] = JSON.parse(
    readFileSync(
        fileURLToPath(
            new URL(
                "../../test-vectors/journal-format-7.1.json",
                import.meta.url,
            ),
        ),
        "utf8",
    ),
).vectors;

let dir: string;

beforeAll(() => {
    dir = mkdtempSync(join(tmpdir(), "jb-container-"));
});

afterAll(() => {
    rmSync(dir, { recursive: true });
});

function vectorNamed(name: string): Vector {
    const vector = vectors.find((v) => v.name === name);
    if (!vector) throw new Error(`No test vector named "${name}"`);

    return vector;
}

function randomnessOf(vector: Vector): SealRandomness {
    return {
        salt: Buffer.from(vector.kdfSalt, "hex"),
        payloadNonce: Buffer.from(vector.payloadNonce, "hex"),
    };
}

// Payload byte i is i mod 251, as in the known-answer vectors.
function payload(length: number): Buffer {
    return Buffer.from(Array.from({ length }, (_, i) => i % 251));
}

function sha256(data: Buffer): string {
    return createHash("sha256").update(data).digest("hex");
}

function tempPath(): string {
    return join(dir, `${Math.random()}.zjournal`);
}

async function seal(
    plaintext: Buffer,
    password = PASSWORD,
    randomness?: SealRandomness,
): Promise<Buffer> {
    const input = tempPath();
    const output = tempPath();
    writeFileSync(input, plaintext);
    await sealContainer(input, output, password, randomness);

    return readFileSync(output);
}

async function open(file: Buffer, password = PASSWORD): Promise<Buffer> {
    const path = tempPath();
    const chunks: Buffer[] = [];
    writeFileSync(path, file);

    for await (const chunk of await openContainer(path, password)) {
        chunks.push(chunk);
    }

    return Buffer.concat(chunks);
}

function expectFailure(
    attempt: Promise<unknown>,
    failure: ContainerFailure,
): Promise<void> {
    return expect(attempt).rejects.toMatchObject({ failure });
}

function changed(file: Buffer, offset: number, value: number): Buffer {
    const copy = Buffer.from(file);
    copy[offset] = value;

    return copy;
}

function flipped(file: Buffer, offset: number): Buffer {
    return changed(file, offset, file[offset] ^ 1);
}

// Seals one chunk the way the spec describes, independently of container.ts.
function sealedChunk(
    key: Buffer,
    index: number,
    plaintext: Buffer,
    isLast: boolean,
): Buffer {
    const nonce = Buffer.alloc(12);
    nonce.writeUIntBE(index, 5, 6);
    nonce[11] = isLast ? 1 : 0;
    const cipher = createCipheriv("aes-256-gcm", key, nonce);

    return Buffer.concat([
        cipher.update(plaintext),
        cipher.final(),
        cipher.getAuthTag(),
    ]);
}

describe("the 7.1 container", () => {
    it("reproduces the known-answer vectors", async () => {
        for (const vector of vectors) {
            const file = await seal(
                payload(vector.payloadLength),
                vector.password,
                randomnessOf(vector),
            );

            expect(file.subarray(0, HEADER_LENGTH).toString("hex")).toBe(
                vector.headerHex,
            );
            expect(sha256(file)).toBe(vector.fileSha256);
            if (vector.fileHex)
                expect(file.toString("hex")).toBe(vector.fileHex);
            expect(await open(file, vector.password)).toEqual(
                payload(vector.payloadLength),
            );
        }
    }, 60_000);

    it("derives the same key from either Unicode form of a password", async () => {
        const vector = vectorNamed("password needing NFC normalization");
        // The vector spells the password decomposed; this is the composed
        // form, built from its code point so the source stays ASCII.
        const composed = await seal(
            payload(vector.payloadLength),
            `caf${String.fromCodePoint(0xe9)} au lait`,
            randomnessOf(vector),
        );

        expect(sha256(composed)).toBe(vector.fileSha256);
    }, 30_000);
});

describe("opening a damaged or foreign 7.1 journal", () => {
    // Three chunks: two full ones and a one-byte last chunk.
    const firstChunkEnd = HEADER_LENGTH + SEALED_CHUNK_LENGTH;
    const secondChunkEnd = firstChunkEnd + SEALED_CHUNK_LENGTH;
    let file: Buffer;

    beforeAll(async () => {
        file = await seal(payload(2 * 65536 + 1));
    }, 30_000);

    it("reports a wrong password", async () => {
        await expectFailure(open(file, "wrong horse"), "wrongPassword");
    }, 30_000);

    it("refuses settings it does not support before running scrypt", async () => {
        await expectFailure(open(changed(file, 8, 2)), "newerVersion");
        await expectFailure(open(changed(file, 9, 2)), "newerVersion");
        await expectFailure(open(changed(file, 10, 16)), "newerVersion");
        await expectFailure(open(changed(file, 10, 20)), "newerVersion");
        await expectFailure(open(changed(file, 11, 1)), "newerVersion");
        await expectFailure(open(changed(file, 12, 2)), "newerVersion");
    });

    it("reports damage to the payload, truncation, extension, and reordering", async () => {
        const swapped = Buffer.concat([
            file.subarray(0, HEADER_LENGTH),
            file.subarray(firstChunkEnd, secondChunkEnd),
            file.subarray(HEADER_LENGTH, firstChunkEnd),
            file.subarray(secondChunkEnd),
        ]);

        await expectFailure(open(flipped(file, 100)), "damaged");
        await expectFailure(open(flipped(file, file.length - 1)), "damaged");
        await expectFailure(open(file.subarray(0, firstChunkEnd)), "damaged");
        await expectFailure(open(file.subarray(0, secondChunkEnd)), "damaged");
        await expectFailure(
            open(file.subarray(0, firstChunkEnd + 5)),
            "damaged",
        );
        await expectFailure(
            open(Buffer.concat([file, file.subarray(secondChunkEnd)])),
            "damaged",
        );
        await expectFailure(open(swapped), "damaged");
        await expectFailure(open(file.subarray(0, 80)), "damaged");
    }, 60_000);

    it("refuses an empty last chunk after the first", async () => {
        const vector = vectorNamed("exactly one chunk");
        const key = Buffer.from(vector.payloadKey, "hex");
        const header = Buffer.from(vector.headerHex, "hex");
        const chunk = payload(vector.payloadLength);
        const valid = Buffer.concat([header, sealedChunk(key, 0, chunk, true)]);
        const withEmptyLast = Buffer.concat([
            header,
            sealedChunk(key, 0, chunk, false),
            sealedChunk(key, 1, Buffer.alloc(0), true),
        ]);

        // The same construction without the empty chunk is the vector itself.
        expect(sha256(valid)).toBe(vector.fileSha256);
        await expectFailure(open(withEmptyLast), "damaged");
    }, 30_000);

    it("reads damage to the header as a wrong password", async () => {
        // kdfSalt, payloadNonce, and headerMac, and then scrypt settings this
        // reader supports but the file was not sealed with.
        await expectFailure(open(flipped(file, 20)), "wrongPassword");
        await expectFailure(open(flipped(file, 35)), "wrongPassword");
        await expectFailure(open(flipped(file, 50)), "wrongPassword");
        await expectFailure(open(changed(file, 10, 18)), "wrongPassword");
    }, 60_000);
});

describe("verifying a save", () => {
    const plaintext = payload(10);
    const plaintextHash = createHash("sha256").update(plaintext).digest();
    let path: string;

    beforeAll(async () => {
        path = tempPath();
        writeFileSync(path, await seal(plaintext));
    }, 30_000);

    it("accepts a journal that reopens to what was sealed", async () => {
        await verifyContainer(path, PASSWORD, plaintextHash);
    }, 30_000);

    it("refuses a journal that reopens to something else", async () => {
        await expect(
            verifyContainer(path, PASSWORD, Buffer.alloc(32)),
        ).rejects.toThrow("did not reopen correctly");
    }, 30_000);

    it("refuses a journal written with a wrong header or a bad chunk", async () => {
        const sealed = readFileSync(path);
        const mismatched = tempPath();
        const corrupted = tempPath();
        writeFileSync(mismatched, changed(sealed, 10, 18));
        writeFileSync(corrupted, flipped(sealed, HEADER_LENGTH + 3));

        await expect(
            verifyContainer(mismatched, PASSWORD, plaintextHash),
        ).rejects.toThrow("did not reopen correctly");
        await expect(
            verifyContainer(corrupted, PASSWORD, plaintextHash),
        ).rejects.toThrow("did not reopen correctly");
    }, 30_000);
});
