# Build Instructions
This is a set of steps for a new release.

* Change the version number in `package.json`.
* For a major (format) change, update `VERSION_NUMBER` in `src/shared/constants.ts`. This also updates the version shown in the About dialog.
* Run `npm run dist` (or a per-platform script such as `npm run dist-mac`) to build the installer.

DevTools open automatically in development (`npm run dev`) and stay closed in packaged builds, so there is nothing to toggle by hand.
