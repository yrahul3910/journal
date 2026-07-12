# JournalBear
A cross-platform journal application built with Electron and React, with AES-256 encryption. The renderer is written in TypeScript and React, styled with [Tailwind CSS](https://tailwindcss.com/) and [Radix UI](https://www.radix-ui.com/) primitives (shadcn-style components). State is managed with [Zustand](https://zustand-demo.pmnd.rs/), data is validated with [Zod](https://zod.dev/), and statistics are rendered with [Chart.js](https://www.chartjs.org/) and [D3](https://d3js.org/). Entries are written in Markdown (rendered with [react-markdown](https://github.com/remarkjs/react-markdown) and [remark-gfm](https://github.com/remarkjs/remark-gfm)).

# Developing
The app is built with [electron-vite](https://electron-vite.org/).

* `npm run dev` starts the app in development mode with hot reload.
* `npm run build` builds the main, preload, and renderer bundles.
* `npm run check` type-checks the project with `tsc --noEmit`.
* `npm run lint` / `npm run lint:fix` lint with [Biome](https://biomejs.dev/); `npm run format` formats.
* `npm run test` / `npm run test:watch` run the [Vitest](https://vitest.dev/) suite.

# Deploying
The repo is configured with `electron-builder`. Run `npm run dist` to create a built executable for your platform, or use the per-platform scripts: `npm run dist-mac`, `npm run dist-linux`, and `npm run dist-win`.

# Folder Structure
The root folder contains the project configuration:
* `electron.vite.config.ts`: The electron-vite configuration for the main, preload, and renderer builds.
* `package.json`: Dependencies, scripts, and the `electron-builder` configuration.
* `tsconfig.json` and `tsconfig.node.json`: TypeScript configuration.
* `tailwind.config.js` and `postcss.config.js`: Tailwind CSS and PostCSS configuration.
* `components.json`: shadcn/ui component configuration.
* `biome.json`: Biome linter and formatter configuration.
* `vitest.config.ts`: Vitest test runner configuration.
* `.editorconfig`: The EditorConfig configuration for editors. VS Code requires a plugin for this to work.

## `src`
All source code lives under `src`, split by Electron process.

### `src/main`
The Electron main process.
* `index.ts` creates the window and hosts the IPC handlers for opening, saving, encrypting, and decrypting journals.
* `archive.ts` compresses and decompresses the journal's `.tar.gz` archive.
* `encryption.ts` handles AES-256 encryption and password strength checks.

### `src/preload`
* `index.ts` is the preload script that exposes a typed IPC bridge to the renderer via `contextBridge`.

### `src/renderer`
The React front end.
* `index.html` is the page Electron loads.
* `src/main.tsx` and `src/App.tsx` are the React entry point and root component.
* `src/index.css` contains the Tailwind directives and global styles.
* `src/components` holds the UI, grouped into `ui` (shadcn-style primitives), `dialogs`, `entry`, `journal`, `layout`, and `welcome`.
* `src/store` holds the Zustand journal store.
* `src/hooks`, `src/lib`, and `src/types` hold shared renderer hooks, helpers, and type definitions.

### `src/shared`
Code shared between the main and renderer processes.
* `journal.ts` defines the Zod schemas for the journal data and the migration from the legacy 5.1 format.
* `constants.ts` defines the format version constants.
* `lib/result.ts` is a small `Result` type used across process boundaries.

## `icons`
Application icons for each platform, referenced from the `electron-builder` configuration.

# File Format
The `.zjournal` file format is formed as follows. The base is a JSON file called `data.json`. All attachments are stored in an `images` folder beside this JSON file. These two are put in a directory called `_jbfiles` in the temp directory. This directory is compressed to a `.tar.gz` format, and this file is encrypted with AES-256 (AES-256-CBC, with the key derived from the password via PBKDF2 and a random salt and IV).

The JSON file (format version 7.0) looks like this:
```
{
    "version": Number,
    "entries": [
        {
            "entryDate": String,
            "content": String,
            "sentiment": String,
            "attachments": [String]
        }
    ]
}
```

The legacy 5.1 format used an `en` key instead of `entries` and a singular `attachment` field; it is migrated to the current format on load. Pre-5.1 formats are unsupported starting with version 7.0.
