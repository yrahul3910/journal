# JournalBear
A cross-platform journal application written in JS and Electron, with AES-256 encryption. Uses [Bootstrap 4](http://getbootstrap.com/), [Metro UI CSS](https://metroui.org.ua/), [jQuery](https://jquery.com/), and [Select2](https://select2.github.io/).

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
