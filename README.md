# JournalBear
A cross-platform journal application written in JS and Electron, with AES-256 encryption. Uses [Bootstrap 4](http://getbootstrap.com/), [Metro UI CSS](https://metroui.org.ua/), [jQuery](https://jquery.com/), and [pickadate](https://github.com/amsul/pickadate.js). Uses emoji images from [emojify.js](https://github.com/emojione/emojify.js), which are stored in the `emoji` directory.

# Deploying
The repo is configured with `electron-builder`. Run `npm run dist` to create a built executable for your platform.

# Folder Structure
The root folder contains the following files:
* `.editorconfig`: The EditorConfig configuration for editors. VS Code requires a plugin for this to work.
* `.eslintignore`: Specifies the folders that ESLint should ignore.
* `.eslintrc.json`: The ESLint configuration file.

## `app`
The `app` folder is the core source code.
* `index.html` is the page source code that Electron renders.
* `index.js` is the Electron index file.
* `render.js` is the JS file that has all the handlers for components in `index.html`.
* `archive.js` is the module that has the archiving related functions.
* `encryption.js` has encryption functions.

## `css` and `js`
The `css` and `js` folders have the files for third-party libraries used. This avoids the need for the user to have an Internet connection.
* Bootstrap and Metro UI CSS provide the styling for the page.
* `default.css`, `default.date.css`, `picker.js`, and `picker.date.js` are the `pickadate.js` datepicker library used in the Add Entry dialog.
* jQuery is used for event handling and DOM manipulation.
* `index.css` contains custom styling used in the app.

## `fonts`
This folder contains fonts required by Metro UI CSS.

# Git Hooks

## `pre-commit`
```sh
#!/bin/sh
eslint .
```

# File Format
The `.zjournal` file format is formed as follows. The base is a JSON file called `data.json`. All attachments are stored in an `images` folder beside this JSON file. These two are put in a directory called `_jbfiles` in the temp directory. This directory is compressed to a `.tar.gz` format, and this file is encrypted by AES-256. 

The JSON file looks like this. The `en` key was required to maintain compatibility with an older version.
```
{
    "en": [
        {
            "sentiment": String,
            "entryDate": String,
            "content": String,
            "attachment": [String],
            "nsfw": boolean
        }
    ]
}
```