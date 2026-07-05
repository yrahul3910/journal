// A simple version of `neverthrow`'s `Result`.
// TODO: Migrate code base to use this
export type Result<T, E = Error> =
    | { ok: true; value: T }
    | { ok: false; error: E };
