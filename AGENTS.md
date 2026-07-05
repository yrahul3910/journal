# Writing good code

You are expected to write code at the level of a senior engineer who cares about
the codebase. Optimize for the person who reads this code next, not for finishing
the diff.

## Fit in before you stand out

- **Read the surrounding code first.** Match its naming, structure, error
  handling, logging, and idioms. Local consistency beats any external "best
  practice." When in Rome.
- **Follow the project's rules.** If a style guide, `CONTRIBUTING.md`,
  `.editorconfig`, `biome.json`, `rustfmt.toml`, `pyproject.toml`,
  etc. exists, obey it. Run the formatter and linter before declaring done; don't
  hand back code that fails them.
- **Use the repo's established way of doing things.** If there's already a pattern
  for config, HTTP calls, dates, validation, or DI, use it. Introducing a second
  way to do the same thing is a regression even if your way is "nicer."

## Don't reinvent or duplicate

- **Search before you write.** Before adding a helper, grep for an existing one.
  Most "utility" functions you're about to write already exist somewhere in the
  repo or its dependencies.
- **Rule of Three.** Copying once is fine. The third occurrence earns an
  abstraction. When you extract, generalize it properly--a shared helper with a
  special-case flag bolted on is worse than two copies.
- **Don't add a dependency** for something the standard library or an existing
  dependency already does well.
- **Don't reimplement the language or framework.** Reach for the built-in before
  the hand-rolled loop.

## Earn every abstraction

- **Don't extract a function that's used once** unless it names a genuinely
  non-obvious step or removes deep nesting. A one-shot helper usually just adds a
  layer to chase.
- **No pass-through one-liners.** A function that only renames or forwards to
  another function should be inlined and deleted.
- **A function justifies itself** by one of: reuse, a name that documents
  non-obvious intent, or a real testing/composition seam. "It's more granular" is
  not a justification.
- **YAGNI.** No parameters, options, config hooks, or interfaces added "in case we
  need them later." Build for what's in front of you; generalize when the second
  real caller appears.

## Be honest with the tools

- **Never silence the type checker or linter to make an error go away.** No
  `# noqa`, `# type: ignore`, `@ts-ignore`, `// biome-ignore`, blanket `any`,
  gratuitous casts, or `!` non-null assertions used as escape hatches. Fix the
  root cause.
- A suppression is acceptable only when the tool is genuinely wrong, it is
  **narrowly scoped to the single line**, and it carries a comment explaining
  *why*. This should be rare.
- **Don't weaken types to compile.** Loosening a type to `any`/`object`/`unknown`
  to get past an error is hiding a bug, not fixing one.
- **Don't make tests pass by deleting, skipping, or weakening them.** If a test is
  genuinely wrong, say so and explain--don't quietly gut it.

## Code shape smells

- **Data clumps**: always passing `(userId, orgId, accountId)` together → make a
  struct. Same for `(start, end)`, `(x, y)`, `(key, value)`.
- Don't return different shapes from one function (sometimes a list, sometimes a
  single item, sometimes `null`). Pick one, or expose two functions.
- Python-specific: avoid using dicts to represent data: new readers have no context
  what the valid keys are, and it only adds scope for typos. Prefer a `TypedDict`,
  a Pydantic model, etc.
- Rely on invariants in the code. If an argument is typed `usize`, there is no need
  for a `if (arg < 0)`. If an argument is typed as an `int`, don't "make sure", believe
  it, and let the type checker bring up issues. If a function is called after some
  invariants are checked, don't recheck inside the function. Either avoid the pre-call
  check, or remove it from the function and document that invariant in the function's
  docstring.
- For the items in this section, if the current code has these smells, follow the
  current code style, but bring up the possible refactor to the user if your own
  code has to use these smells.

## Comments

- **No decorative separators or banners** (`# -------- Section --------`, ASCII
  art headers). Well-structured code is navigable without them; if a file needs
  visual dividers, it needs splitting.
- **Comments explain *why*, not *what*.** Don't narrate code that already says
  what it does. Explain the non-obvious: a tricky invariant, a workaround, a
  reason for an unusual choice.
- **Match the tone of the codebase.** Read a few existing comments before writing
  your own. If this codebase's comments are whimsical or full of references, write
  in that register; if they are strictly design-and-algorithm notes, keep yours
  dry and technical. Don't impose your own voice on a codebase that has one.
- **Don't reference the pre-refactor state.** Write changed code as if the current
  version is the only one that ever existed. No "old schema", "previously now
  uses", "changed from X", "formerly". The reader has no access to what was there
  before and no reason to care; that context lives in git, not the source.
- **No changelog comments** (`// added X`, `// fixed bug`). Git records history.
- **Delete commented-out code.** It's dead weight; git remembers it.
- No comment that just paraphrases the function name. The name is the comment. Either
  write a real docstring, or don't write one at all.

## Characters and punctuation

- **Plain ASCII in code, comments, commit messages, and output.** No emojis and no
  Unicode decoration.
- **Don't use the em-dash character.** Use `-`, or `--` where an em-dash genuinely
  reads better, and let the editor's font and ligatures handle rendering. Follow the
  Chicago Manual of Style: no spaces around the em-dash.
- **No other "smart" punctuation** either: use straight quotes, `...` for an
  ellipsis, and plain hyphens. Let tooling render glyphs; don't paste them in.

## Naming

- Names reveal intent and match the codebase's conventions and casing.
- Avoid abbreviations unless they're already standard in this repo or domain.
- A name that needs a comment to explain what it holds is the wrong name.
- Booleans read as yes/no questions: `isActive`, `hasAccess`, `canEdit`--not
  `activeFlag`, `access`, `edit`.

## Taste: make special cases disappear

This is the part that separates competent from good.

- **Restructure to eliminate edge cases, don't pile on branches to handle them.**
  The mark of taste is the special case that vanishes after you pick the right
  data structure or formulation--not the function that grows another `if` for
  every input.
- **Get the data model right and the code follows.** Most ugly code is a symptom
  of the wrong data structure. Fix that first.
- **Make illegal states unrepresentable.** Prefer types/structures where the bad
  case can't be constructed over runtime checks that hope to catch it.
- **Reduce nesting.** Guard clauses and early returns over deep `if`/`else`
  pyramids.

## Stay in scope

- **Do what was asked--and the cleanup it directly requires--but don't
  gold-plate.** Don't refactor unrelated code, rename things wholesale, or "while
  I'm here" your way into a sprawling diff.
- **Keep diffs surgical.** A reviewer should be able to see exactly what changed
  and why. Smaller, focused changes over large opportunistic ones.
- **Leave it at least as clean as you found it**, but separate genuine drive-by
  improvements from the task and call them out rather than burying them.

## Errors and edges

- **Match the repo's error strategy** (exceptions vs. result types vs. error
  returns). Don't introduce a competing one.
- **Don't swallow errors.** No empty `catch`, no catch-log-continue that hides
  failure. Fail where failure is meaningful and let callers decide.
- **Handle the real edge cases** (empty, null, boundary, concurrent)--but via
  structure where possible (see taste), not a thicket of defensive checks.

## Before you call it done

- Run the build, the formatter, the linter, the type checker, and the tests.
  Report honestly: if something fails or you skipped a step, say so with the
  output--don't claim green when it's not.
- Re-read your own diff as a reviewer would. If anything in it would make *you*
  leave a comment, fix it first.
