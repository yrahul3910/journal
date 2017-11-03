# JournalBear
A cross-platform journal application written in JS and Electron, with AES-256 encryption. Uses [Bootstrap 4](http://getbootstrap.com/), [Metro UI CSS](https://metroui.org.ua/), [jQuery](https://jquery.com/), [Select2](https://select2.github.io/), and [pickadate](https://github.com/amsul/pickadate.js)

# Deploying
The repo is configured with `electron-builder`. Run `npm run dist` to create a built executable for your platform. `electron-updater` is used for auto updating.

## `electron-builder` Configuration
Add the following `electron-builder.yml` file:
```
appId: com.yrahul.journalbear
publish:
    provider: github
    token: <GitHub access token>
```

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

## `css` and `js`
The `css` and `js` folders have the files for third-party libraries used. This avoids the need for the user to have an Internet connection.
* Bootstrap and Metro UI CSS provide the styling for the page.
* `default.css`, `default.date.css`, `picker.js`, and `picker.date.js` are the `pickadate.js` datepicker library used in the Add Entry dialog.
* jQuery is used for event handling and DOM manipulation.
* The `select` control in the Add Entry dialog is styled by `Select2`.
* `index.css` contains custom styling used in the app.

## `fonts`
This folder contains fonts required by Metro UI CSS.
