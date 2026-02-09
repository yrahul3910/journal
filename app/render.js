/* eslint no-undef: 0 */
// Required for opening dialogs and context menus
import remote from "@electron/remote";
const { dialog, Menu, MenuItem } = remote;
const window = remote.getCurrentWindow();

import fs from "fs";
import fse from "fs-extra";
import os from "os";
import path from "path";
import $ from "jquery";
import async from "async";
import alertify from "alertify.js";
import emojify from "emojify.js";
import * as archiveUtils from "./archive.js";
import { injectEmojis } from "./injectEmoji.js";
import { rimraf } from "rimraf";
import { Chart, ArcElement, PieController, Tooltip, Legend } from "chart.js";
import { getDecryptedText, checkPwdStrength, encryptFile, decryptFile } from "./encryption.js";

// Register Chart.js components
Chart.register(ArcElement, PieController, Tooltip, Legend);

import _ from "lodash";
import moment from "moment";
import showdown from "showdown";

/* JournalBear uses Showdown to render Markdown in entries. Emojis
are supported as well. */
const converter = new showdown.Converter({
    literalMidWordUnderscores: true,
    literalMidWordAsterisks: true,
    tables: true,
    strikethrough: true,
    tasklists: true,
    simpleLineBreaks: true,
    simplifiedAutoLink: true,
    openLinksInNewWindow: true,
    emoji: false,
    backslashEscapesHTMLTags: true
});

/* Set the directory for emoji. Unfortunately I had to compromise between
duplicating all the emoji into an 'all' folder or not having a decent way
to implement tabs for emoji. */
emojify.setConfig({
    img_dir: "../emoji/all",
});

/* Remember to update this on major releases. This indicates the 
incompatible versions to the app. */
const VERSION_NUMBER = 6.0;

// Sentiment-color maps for the circles beside entries
const sentiments = {
    "Happy": "green",
    "Angry": "red",
    "Sad": "#FBCA04",
    "Neutral": "gray",
    "Loved": "hotpink",
    "Excited": "lime",
    "Unknown": "black" // only required for Statistics pie chart
};

// Implementation of the context menu to save images to disk
let globalStore = {
    imgPath: null
};
const imgContextMenu = new Menu();
imgContextMenu.append(new MenuItem({
    label: "Save to disk",
    async click() {
        const result = await dialog.showOpenDialog({
            title: "Choose a folder",
            properties: ["openDirectory"]
        });
        if (!result.canceled && result.filePaths) {
            let filename = globalStore.imgPath.slice(globalStore.imgPath.lastIndexOf("/"));
            fse.copy(globalStore.imgPath, result.filePaths[0] + filename, (err) => {
                if (err) alertify.error("Failed to save image");
                else alertify.success("Saved image successfully.");
            });
        }
    }
}));

// The encrypted JSON data read from a journal file
let encryptedData;
// The current journal's password
let pwd;
// The version of JournalBear used by the current file
let currentFileVersion;
// Path to the .zjournal file opened
let currentFilePath;
// The decrypted object holding the entries
let journalEntries;
let currentEntryCount;
// Holds the base64 encoded attachment images of the current entry
let encodedImages = [];
// Used to store the HTML of all the entries
let allEntriesHTML;
// Handle to current sentiment analysis chart
let currentChart;

/**
 * Shows the JSON of all entries to clean HTML in the app's left pane.
 * @param {object} data - The JSON object 
 */
function showData(data) {
    // Clear the list
    $("#list").html("");
    let json = JSON.parse(data).en;
    currentEntryCount = json.length;
    journalEntries = JSON.parse(data);
    
    // Group entries by year
    const entriesByYear = {};
    json.forEach((entry, index) => {
        const year = moment(entry.entryDate).year();
        if (!entriesByYear[year]) {
            entriesByYear[year] = [];
        }
        entriesByYear[year].push({ entry, index });
    });
    
    // Sort years in descending order
    const years = Object.keys(entriesByYear).sort((a, b) => b - a);
    
    let html = "";
    years.forEach(year => {
        const yearEntries = entriesByYear[year];
        const entryCount = yearEntries.length;
        
        // Year header (collapsible)
        html += `<div class="year-section">`;
        html += `<div class="year-header" data-year="${year}">`;
        html += `<span class="year-toggle">▼</span>`;
        html += `<span class="year-title">${year}</span>`;
        html += `<span class="year-count">${entryCount} ${entryCount === 1 ? 'entry' : 'entries'}</span>`;
        html += `</div>`;
        html += `<div class="year-content" data-year-content="${year}">`;
        
        // Add entries for this year
        yearEntries.forEach(({ entry, index }) => {
            let sentiment = (entry.sentiment ? entry.sentiment : "Neutral");
            html += "<div class='entry' id='" + index + "'><b>";
            html += new Date(entry.entryDate).toDateString() + "</b>";
            html += `<span>  </span><span class='sentiment ${sentiment}'> </span>\
                <span style='color: ${sentiments[sentiment]}; font-size: 12px'>${sentiment}</span>`;
            if (entry.nsfw)
                html += `<span class="nsfw">NSFW</span>`;
            html += `<br/><p>`;
            let words = entry.content.split(/\s+/).slice(0, 5).join(" ");
            html += words + "...</p></div>";
        });
        
        html += `</div></div>`; // Close year-content and year-section
    });
    
    $("#list").html(html);
    allEntriesHTML = html;

    // Bind click handlers for entries
    $(".entry").click((e) => {
        onEntryClicked(e, json);
    });
    
    // Bind click handlers for year headers (toggle collapse)
    $(".year-header").click((e) => {
        const year = $(e.currentTarget).data("year");
        const yearContent = $(`[data-year-content="${year}"]`);
        const toggle = $(e.currentTarget).find(".year-toggle");
        
        yearContent.slideToggle(200);
        toggle.text(toggle.text() === "▼" ? "▶" : "▼");
    });
}

/**
 * Get the percentage of each emotion in the current journal.
 */
const getEmotionPercentages = (year) => {
    let counts = {
        "Happy": 0,
        "Angry": 0,
        "Sad": 0,
        "Neutral": 0,
        "Loved": 0,
        "Excited": 0,
        "Unknown": 0
    };

    for (let entry of journalEntries.en) {
        // For old versions of the journal, the sentiment is undefined.
        if (!year || year == moment(entry.entryDate).year()) {
            if (!entry.sentiment)
                counts["Unknown"]++;
            else
                counts[entry.sentiment]++;
        }
    }

    // Divide counts by the sum to get fractions
    // Object.values isn't supported, so need to use the roundabout
    // method with map()
    let sum = _.sum(Object.keys(counts).map(x => counts[x]));
    Object.keys(counts).map(key => {
        counts[key] /= sum;

        // Get a percentage rounded to 2 decimal places.
        counts[key] = Math.floor(counts[key] * 1e4) / 100;
    });

    return counts;
}

/**
 * Returns the HTML code for the content of a single entry.
 * This does NOT include images, only the header and the content
 * text. Use getAttachmentHtml() for that HTML code.
 * @param {object} json - The individual entry JSON
 */
const getContentHtml = (json) => {
    let { sentiment, entryDate, content } = json;
    let entryHTML = "<p><b>" + (new Date(entryDate).toDateString()) + "</b>" +
        "<span>  </span><span class='sentiment " + (sentiment ? sentiment : "Neutral") + "'></span>";
    entryHTML += `<span style='color: ${sentiments[sentiment]}; font-size: 12px'> ${sentiment}</span>`;
    entryHTML += "</p><p>" + converter.makeHtml(content) + "</p>";

    return entryHTML;
};

/**
 * Returns the HTML code for the attachments in an entry.
 * @param {Array} attachment - The attachment value of the entry
 * @param {string} baseDir - The base directory where the .json is stored
 */
const getAttachmentHtml = (attachment, baseDir = os.tmpdir()) => {
    // Create the HTML element
    let element = $("<div />");

    if (attachment instanceof Array) {
        for (let img of attachment) {
            // Major hacky workaround to support older versions where images
            // were in base64, but some base64 encodings didn't have the
            // data:image/png;base64; header.
            let imgPath = img;

            // base64 strings have only + and / as special characters
            if (!imgPath.includes(".")) {
                // It's not a version 5.1 path
                if (!imgPath.startsWith("data:image"))
                    imgPath = "data:image/png;base64," + imgPath;
            } else {
                // More hacky code ack.
                // Two places to check: $TMPDIR/_jbimages and baseDir/images
                // Check the latter first
                // Replace that . with the temp directory as necessary.
                imgPath = baseDir + imgPath.slice(1);
                if (!fs.existsSync(imgPath)) {
                    // We know it's in $TMPDIR/_jbimages
                    // First get the filename
                    let filename = imgPath.substring(imgPath.lastIndexOf("/") + 1);

                    if (baseDir != os.tmpdir()) {
                        /* In this case, we're exporting to HTML after we've added an
                        entry. We can't reference os.tmpdir() there, because the file
                        may be deleted. Thus, we need to copy this to baseDir/images 
                        first. */
                        fse.moveSync(`${os.tmpdir()}/_jbimages/${filename}`, baseDir + "/images");
                    }
                    imgPath = `${baseDir}/_jbimages/${filename}`;
                }
            }

            $("<img>", {
                "src": imgPath,
                "style": "margin-bottom: 10px"
            }).appendTo(element);
        }
    } else {
        if (attachment) {
            let img = attachment;
            if (!img.startsWith("data:image"))
                img = "data:image/png;base64," + img;

            $("<img>", {
                "src": img,
                "style": "margin-bottom: 10px"
            }).appendTo(element);
        }
    }

    return element;
};

/**
 * Handles the click event for an entry in the left pane.
 * @param {event} e - The event object
 * @param {object} json - The JSON of all entries
 */
const onEntryClicked = (e, json) => {
    const id = e.currentTarget.id;
    const selectedEntry = json[+id];
    // selectedEntry.attachment, content, entryDate are the properties
    let entryHTML = getContentHtml(selectedEntry);
    $("#content").html(entryHTML);

    // Some older versions had 'Attachment' as the key.
    let attachment = selectedEntry.attachment || selectedEntry.Attachment;
    let attachmentElement = getAttachmentHtml(attachment);
    $("#content").append(attachmentElement);

    // Emojify the content
    emojify.run(document.getElementById("content"));

    // Hook up the context menu for the images
    $("img").on("contextmenu", (e) => {
        e.preventDefault();
        globalStore.imgPath = e.target.getAttribute("src");
        imgContextMenu.popup(window);
    });
};

// Theme management
const applyTheme = (isDark) => {
    console.log("[THEME] Applying theme:", isDark ? "dark" : "light");
    if (isDark) {
        $("body").addClass("dark-theme");
    } else {
        $("body").removeClass("dark-theme");
    }
};

const initTheme = () => {
    console.log("[THEME] Initializing theme");
    let savedTheme = localStorage.getItem("theme");
    
    // Check if user has a saved preference
    if (savedTheme === "dark" || savedTheme === "light") {
        console.log("[THEME] Using saved preference:", savedTheme);
        applyTheme(savedTheme === "dark");
        document.getElementById("darkThemeEnable").checked = savedTheme === "dark";
    } else {
        // Use system theme
        console.log("[THEME] Using system theme");
        const systemPrefersDark = window.matchMedia('(prefers-color-scheme: dark)').matches;
        applyTheme(systemPrefersDark);
        document.getElementById("darkThemeEnable").checked = systemPrefersDark;
        localStorage.setItem("theme", systemPrefersDark ? "dark" : "light");
    }
    
    // Listen for system theme changes
    window.matchMedia('(prefers-color-scheme: dark)').addEventListener('change', (e) => {
        console.log("[THEME] System theme changed to:", e.matches ? "dark" : "light");
        // Only auto-switch if user hasn't explicitly set a preference recently
        const savedTheme = localStorage.getItem("theme");
        const lastThemeChange = localStorage.getItem("lastThemeChange");
        const now = Date.now();
        
        // If user changed theme in the last 5 minutes, don't auto-switch
        if (lastThemeChange && (now - parseInt(lastThemeChange)) < 5 * 60 * 1000) {
            console.log("[THEME] Ignoring system change due to recent user preference");
            return;
        }
        
        applyTheme(e.matches);
        document.getElementById("darkThemeEnable").checked = e.matches;
        localStorage.setItem("theme", e.matches ? "dark" : "light");
    });
};

$(document).ready(() => {
    // Add emojis to the tabs in the emoji box
    injectEmojis("#other-emoji", "../emoji");
    injectEmojis("#activity", "../emoji/Activity");
    injectEmojis("#faces-reactions", "../emoji/Faces and Reactions");
    injectEmojis("#food-drink", "../emoji/Food and Drink");
    injectEmojis("#nature-emojis", "../emoji/Nature");
    injectEmojis("#object-emojis", "../emoji/Objects");
    injectEmojis("#symbols-flags", "../emoji/Symbols and Flags");
    injectEmojis("#travel-emojis", "../emoji/Travel");

    // Emoji picker toggle
    $("#emoji-toggle-btn").click((e) => {
        e.preventDefault();
        $("#emoji-picker").slideToggle(200);
    });

    // Initialize theme
    initTheme();
});

// -----------------------
// Titlebar event handlers
// -----------------------
$("#minimize").click(() => {
    window.minimize();
});

$("#maximize").click(() => {
    if (window.isMaximized()) {
        window.unmaximize();
    } else {
        window.maximize();
    }
});

$("#close").click(() => {
    window.close();
});

// Toggle dark theme and save preferences
$("#darkThemeEnable").on("change", () => {
    const isDark = $("#darkThemeEnable").is(":checked");
    console.log("[THEME] User toggled theme to:", isDark ? "dark" : "light");
    
    applyTheme(isDark);
    localStorage.setItem("theme", isDark ? "dark" : "light");
    localStorage.setItem("lastThemeChange", Date.now().toString());
});

// ---------------------------------------
// Preferences menu entries click handlers
// ---------------------------------------
$("#settingsButton").click(() => {
    Metro.dialog.open(document.getElementById("settingsDialog"));
    $(".dialog-overlay").css("background", "rgba(29, 29, 29, 0.7");
});

$("#changePassword").click(() => {
    if (!journalEntries) {
        alertify.error("No journal is open.");
        return;
    }

    Metro.dialog.open(document.getElementById("newJournalDialog"));
    $("#encryptionNotice").html("Please enter a new secure password.");
    $("#confirmNewJournal").text("Change Password");
    $("#password").val("");
    $("#confirmPassword").val("");
    $(".dialog-overlay").css("background", "rgba(29, 29, 29, 0.7");
});

$("#tutorial").click(() => {
    Metro.dialog.open(document.getElementById("introDialog"));
    $(".dialog-overlay").css("background", "rgba(29, 29, 29, 0.7");
});

// ------------------------------
// File menu entry click handlers
// ------------------------------
$("#open").click(async () => {
    console.log("[OPEN] File open dialog clicked");
    try {
        const result = await dialog.showOpenDialog({
            filters: [
                { name: "JournalBear 5.1 Document", extensions: ["zjournal"] },
                { name: "JournalBear 5.0 Document", extensions: ["ejournal"] }
            ]
        });
        
        console.log("[OPEN] Dialog result:", result);
        
        if (result.canceled || !result.filePaths) {
            console.log("[OPEN] Dialog canceled or no file selected");
            return;
        }
        
        const filenames = result.filePaths;
        console.log("[OPEN] Selected file:", filenames[0]);

        if (filenames[0].endsWith(".ejournal")) {
            console.log("[OPEN] Detected version 5.0 file");
            currentFileVersion = 5.0;
        } else {
            console.log("[OPEN] Detected version 5.1 file");
            currentFilePath = filenames[0];
            currentFileVersion = 5.1;
        }

        $("#welcome-page").css("display", "none");
        $("#journal-mode").css("display", "flex");

        console.log("[OPEN] Reading file...");
        encryptedData = fs.readFileSync(filenames[0]).toString();
        console.log("[OPEN] File read successfully, length:", encryptedData.length);
        
        Metro.dialog.open(document.getElementById("decryptDialog"));
        $(".dialog-overlay").css("background", "rgba(29, 29, 29, 0.7");
        console.log("[OPEN] Decrypt dialog opened");
    } catch (error) {
        console.error("[OPEN] Error in file open:", error);
        alertify.error("Failed to open file: " + error.message);
    }
});

$("#save").click(async () => {
    console.log("[SAVE] Save button clicked");
    try {
        const result = await dialog.showSaveDialog({
            filters: [
                { name: "JournalBear 5.1 Document", extensions: ["zjournal"] }
            ]
        });
        
        console.log("[SAVE] Dialog result:", result);
        
        if (result.canceled || !result.filePath) {
            console.log("[SAVE] Save canceled");
            return;
        }
        
        const filename = result.filePath;
        console.log("[SAVE] Save path:", filename);

        journalEntries.version = VERSION_NUMBER;
        let journalDir = os.tmpdir() + "/_jbfiles";
        console.log("[SAVE] Journal directory:", journalDir);
        
        if (fs.existsSync(journalDir))
            fse.removeSync(journalDir + "/data.json");
        else
            fs.mkdirSync(journalDir);

        async.waterfall([
            (callback) => {
                // Write the JSON file
                console.log("[SAVE] Step 1: Writing data...");
                $("#save-status").html("Writing data (1/4)");
                fs.writeFile(journalDir + "/data.json", JSON.stringify(journalEntries), callback);
            },
            (callback) => {
                // Add the images now
                console.log("[SAVE] Step 2: Adding images...");
                $("#save-status").html("Adding images (2/4)");
                if (fs.existsSync(os.tmpdir() + "/_jbimages")) {
                    // fs-extra's copy returns a promise in newer versions, wrap it for callback
                    fse.copy(os.tmpdir() + "/_jbimages", journalDir + "/images")
                        .then(() => callback(null))
                        .catch(callback);
                } else {
                    callback(null);
                }
            },
            (callback) => {
                // Create the .tar.gz
                console.log("[SAVE] Step 3: Compressing...");
                $("#save-status").html("Compressing (3/4)");
                archiveUtils.compress(journalDir, (err, tmpPath) => {
                    if (err) {
                        console.error("[SAVE] Compression error:", err);
                        callback(err);
                    } else {
                        console.log("[SAVE] Compressed to:", tmpPath);
                        callback(null, tmpPath);
                    }
                });
            },
            (tmpPath, callback) => {
                // Encrypt the file
                console.log("[SAVE] Step 4: Encrypting...");
                $("#save-status").html("Encrypting (4/4)");
                encryptFile(tmpPath, filename, pwd, callback);
            },
            (callback) => {
                // Display success message
                console.log("[SAVE] Save complete!");
                $("#save-status").html("");
                alertify.success("Successfully saved!");
                callback(null);
            }
        ], (err) => {
            if (err) {
                console.error("[SAVE] Error in waterfall:", err);
                alertify.error("Failed to save: " + err.message);
            }
        });
    } catch (error) {
        console.error("[SAVE] Error in save:", error);
        alertify.error("Failed to save file: " + error.message);
    }
});

$("#export").click(async () => {
    console.log("[EXPORT] Export button clicked");
    try {
        const result = await dialog.showSaveDialog({
            filters: [
                { name: "HTML Page", extensions: ["html"] }
            ]
        });
        
        if (result.canceled || !result.filePath) {
            console.log("[EXPORT] Export canceled");
            return;
        }
        
        const filename = result.filePath;
        console.log("[EXPORT] Export to:", filename);

        let journalDir = os.tmpdir() + "/_jbfiles";
        console.log("[EXPORT] Journal directory:", journalDir);

        // Obtain the directory to save to
        let exportPath = filename.split("/");
        exportPath.pop();
        exportPath = exportPath.join("/");
        console.log("[EXPORT] Export directory:", exportPath);

        // Start by moving the images if they exist
        const imagesSourcePath = journalDir + "/images";
        const imagesDestPath = exportPath + "/_jbimages";
        
        console.log("[EXPORT] Checking for images at:", imagesSourcePath);
        
        if (fse.existsSync(imagesDestPath)) {
            console.log("[EXPORT] Removing existing images directory");
            rimraf.sync(imagesDestPath);
        }
        
        if (fse.existsSync(imagesSourcePath)) {
            console.log("[EXPORT] Moving images from", imagesSourcePath, "to", imagesDestPath);
            fse.copySync(imagesSourcePath, imagesDestPath);
        } else {
            console.log("[EXPORT] No images directory found, skipping");
        }

        // HTML code
        let element = $("<div />");

        // Create the HTML code necessary
        console.log("[EXPORT] Creating HTML for", journalEntries.en.length, "entries");
        for (let entry of journalEntries.en) {
            let entryHTML = getContentHtml(entry);
            element.append(entryHTML);

            // Some older versions had 'Attachment' as the key.
            let attachment = entry.attachment || entry.Attachment;
            let attachmentElement = getAttachmentHtml(attachment, exportPath);
            element.append(attachmentElement);
        }

        // Write out the HTML
        let html = element.prop("outerHTML");
        console.log("[EXPORT] Writing HTML file, length:", html.length);
        fs.writeFileSync(filename, html);
        console.log("[EXPORT] Export complete!");
        alertify.success("Successfully exported!");
    } catch (error) {
        console.error("[EXPORT] Export error:", error);
        alertify.error("Failed to export: " + error.message);
    }
});

$("#newJournal").click(() => {
    Metro.dialog.open(document.getElementById("newJournalDialog"));
    $("#encryptionNotice").html("Your journal will be encrypted. Please enter a strong " +
        "password. It's recommended to use a passphrase instead, but it's optional.");
    $("#confirmNewJournal").text("Create New Journal");
    $("#password").val("");
    $("#confirmPassword").val("");
    $(".dialog-overlay").css("background", "rgba(29, 29, 29, 0.7");
});

// -------------------------------
// Entry menu entry click handlers
// -------------------------------
$("#newEntry").click(() => {
    if (!journalEntries) {
        Metro.dialog.open(document.getElementById("errDialog"));
        return;
    }

    // First undo any changes that clicking the Update Entry menu item
    // might've done.
    $("#addEntry").text("Add Entry");
    $("#date").attr("disabled", false);
    $("#attachmentInput").css("display", "block");

    $("#date").val(new Date().toISOString().slice(0, 10));
    Metro.dialog.open(document.getElementById("editDialog"));
    $(".dialog-overlay").css("background", "rgba(29, 29, 29, 0.7");
    $("#addEntryError").hide();
});

$("#updateEntry").click(() => {
    console.log("[UPDATE] Update entry clicked");
    if (!journalEntries) {
        Metro.dialog.open(document.getElementById("errDialog"));
        return;
    }

    let dateString = $("#content :nth-child(1) :nth-child(1)").text().split("\n")[0];
    console.log("[UPDATE] Date string from content:", dateString);

    let date = new Date(dateString);
    console.log("[UPDATE] Parsed date:", date);
    
    let entry = journalEntries.en.find((entry) => {
        return moment(date).isSame(new Date(entry.entryDate), "day");
    });
    
    console.log("[UPDATE] Found entry:", entry);

    if (!entry) {
        console.error("[UPDATE] Could not find entry for date:", date);
        alertify.error("Could not find the entry to update. Please select an entry first.");
        return;
    }

    Metro.dialog.open(document.getElementById("editDialog"));

    // Make required changes to fields.
    $("#addEntry").text("Update Entry");
    $("#date").attr("disabled", true);
    // Disallow changes to the attachment
    $("#attachmentInput").css("display", "none");

    $("#date").val(moment(date).format("YYYY-M-D"));
    $("#entrySentiment").val(entry.sentiment);
    $("#entryTextarea").val(entry.content);
});

// Search click handler
$("#search").click(() => {
    Metro.dialog.open(document.getElementById("searchDialog"));
    $(".dialog-overlay").css("background", "rgba(29, 29, 29, 0.7");
});

// Search button click handler
$("#searchButton").click(() => {
    console.log("[SEARCH] Search button clicked");
    let hasAttachment = $("#hasAttachment").prop("checked");
    let query = $("#searchQuery").val();
    let sentiment = $("#searchSentiment").val();
    
    console.log("[SEARCH] Search params:", { hasAttachment, query, sentiment });

    Metro.dialog.close(document.getElementById("searchDialog"));

    /* Show the entries which match the query in #list. We prompt the user
    to click the Journal button in the menu to get back to all entries,
    which we've stored in the allEntriesHTML variable. */
    $("#content").html("");

    let queryResults = [], html = "", resultCount = 0;
    for (let i = 0; i < journalEntries.en.length; ++i) {
        let entry = journalEntries.en[i];
        
        // Check each condition - only apply if user specified it
        let contentMatches = true;
        if (query && query.trim() !== "") {
            contentMatches = new RegExp(query, 'i').test(entry.content); // case insensitive
        }
        
        let sentimentMatches = true;
        if (sentiment && sentiment.trim() !== "") {
            sentimentMatches = entry.sentiment == sentiment;
        }
        
        let attachmentMatches = true;
        if (hasAttachment) {
            // Only filter by attachment if checkbox is checked
            let attachment = entry.attachment || entry.Attachment;
            console.log("[SEARCH] Entry", i, "attachment:", attachment, "type:", typeof attachment, "is array:", Array.isArray(attachment));
            
            // Check if attachment exists AND is not empty
            let hasAttachmentInEntry = false;
            if (attachment) {
                if (Array.isArray(attachment)) {
                    hasAttachmentInEntry = attachment.length > 0;
                } else {
                    hasAttachmentInEntry = true; // Non-array truthy value means has attachment
                }
            }
            
            attachmentMatches = hasAttachmentInEntry;
            console.log("[SEARCH] Entry", i, "hasAttachmentInEntry:", hasAttachmentInEntry);
        }
        
        console.log("[SEARCH] Entry", i, ":", { contentMatches, sentimentMatches, attachmentMatches });
        
        if (contentMatches && sentimentMatches && attachmentMatches) {
            queryResults.push(journalEntries.en[i]);

            html += "<div class='queryResult' id='" + resultCount + "'><b>";
            html += new Date(journalEntries.en[i].entryDate).toDateString() + "</b><br/><p>";
            let words = journalEntries.en[i].content.split(/\s+/).slice(0, 5).join(" ");
            html += words + "...</p></div><hr />";

            resultCount += 1;
        }
    }
    
    console.log("[SEARCH] Found", resultCount, "results");
    $("#list").html(html);
    $(".queryResult").click((e) => {
        onEntryClicked(e, queryResults);
    });

    alertify.delay(6000).log("Click the JournalBear button in the menu to return to all entries.");
    $("#branding").click(() => {
        $("#list").html(allEntriesHTML);

        // We need to rebind this handler
        $(".entry").click((e) => {
            onEntryClicked(e, journalEntries.en);
        });

        // Re-enable the menu items we disabled (below)
        $(".app-bar-menu").css("display", "block");
    });

    // We should also prevent him from adding new entries and stuff.
    // We'll enable that when he clicks the Journal menu button.
    $(".app-bar-menu").css("display", "none");
});

// Statistics click handler
$("#sentimentAnalysis").click(() => {
    console.log("[STATS] Statistics button clicked");
    Metro.dialog.open(document.getElementById("sentimentDialog"));
    $(".dialog-overlay").css("background", "rgba(29, 29, 29, 0.7");

    // Populate the select with the unique years that the user has
    // added entries. Sort the years in descending order.
    let entries = journalEntries.en;
    let years = entries.map(x => moment(x.entryDate).year());
    let uniqueYears = [...new Set(years)].sort().reverse();
    
    // Clear existing options first (except "All")
    $("#sentimentYearsSelect option:not(:first)").remove();
    
    for (let year of uniqueYears)
        $("#sentimentYearsSelect").append(`<option>${year}</option>`);

    // Show the total entry count
    $("#totalEntriesCount").html(entries.length);

    let percentages = getEmotionPercentages();
    console.log("[STATS] Emotion percentages:", percentages);
    
    currentChart = new Chart(document.getElementById("sentimentRatioChart"), {
        type: "pie",
        data: {
            labels: Object.keys(percentages),
            datasets: [{
                label: "Percentage of emotions",
                data: Object.keys(percentages).map(x => percentages[x]),
                backgroundColor: Object.keys(percentages).map(key => sentiments[key]),
            }]
        }
    });
});

$("#sentimentYearsSelect").change(e => {
    Metro.dialog.open(document.getElementById("sentimentDialog"));
    $(".dialog-overlay").css("background", "rgba(29, 29, 29, 0.7");

    let percentages;
    if (e.target.value == "All")
        percentages = getEmotionPercentages();
    else
        percentages = getEmotionPercentages(e.target.value);

    currentChart.destroy();
    currentChart = new Chart(document.getElementById("sentimentRatioChart"), {
        type: "pie",
        data: {
            labels: Object.keys(percentages),
            datasets: [{
                label: "Percentage of emotions",
                data: Object.keys(percentages).map(x => percentages[x]),
                backgroundColor: Object.keys(percentages).map(key => sentiments[key]),
            }]
        }
    });
});

// --------------------------------------
// New entry dialog button click handlers
// --------------------------------------
$("#addEntry").click(() => {
    let date = new Date($("#date").val());
    let content = $("#entryTextarea").val();
    let nsfw = $("#add-nsfw-label").hasClass("active");

    let isNewEntry; // is it a new entry or an updation?
    if ($("#addEntry").text() === "Add Entry")
        isNewEntry = true;
    else
        isNewEntry = false;

    // Make sure this isn't a duplicate entry.
    if (isNewEntry) {
        for (let i = 0; i < currentEntryCount; ++i) {
            if (date.getTime() === new Date(journalEntries.en[i].entryDate).getTime()) {
                $("#addEntryError").html(`<span style="color: red">Multiple entries
                for the same date not allowed.</span>`);
                $("#addEntryError").show();
                return;
            }
        }
    }

    let sentiment = $("#entrySentiment").val();
    // Add the entry to the list of entries
    let newEntry = { entryDate: date, content, attachment: encodedImages, sentiment, nsfw };

    if (isNewEntry) {
        journalEntries.en.push(newEntry);

        // Show the entry in #list.
        let html = "";
        html += "<div class='entry' id='" + currentEntryCount + "'><b>";
        html += date.toDateString() + "</b><span>  </span><span class='sentiment " +
            sentiment + "'></span>" + `<span style="color: ${sentiments[sentiment]}; font-size: 12px"> \
            ${sentiment}</span>`;
        if (nsfw)
            html += `<span class="nsfw">NSFW</span>`;
        html += "<br/><p>";
        let words = content.split(/\s+/).slice(0, 5).join(" ");
        html += words + "...</p></div><hr />";
        $("#list").append(html);
        allEntriesHTML += html;
        currentEntryCount++;
    } else {
        for (let entry of journalEntries.en) {
            // First find the entry
            if (moment(date).isSame(new Date(entry.entryDate), "day")) {
                // We can directly modify the entry over here.
                entry.content = content;
                entry.sentiment = sentiment;

                // Change the HTML
                showData(JSON.stringify(journalEntries));

                // Get out of the loop now
                break;
            }
        }
    }

    // We need to rebind this handler
    $(".entry").click((e) => {
        onEntryClicked(e, journalEntries.en);
    });
    Metro.dialog.close(document.getElementById("editDialog"));

    $("#entryTextarea").val("");
    $("#selectFile").val("");
    $("#add-nsfw-label").removeClass("active");
    $("#addEntryError").hide()
    encodedImages = [];
});

$("#cancelEntry").click(() => {
    Metro.dialog.close(document.getElementById("editDialog"));
    $("#entryTextarea").val("");
    $("#add-nsfw-label").removeClass("active");
    $("#addEntryError").hide()
});

// Handle Enter key on unlock dialog
$("#unlock").on("keyup", (e) => {
    if (e.keyCode === 13) {
        $("#decryptJournal").trigger("click");
    }
});

// ---------------------------------------------
// Click handlers for confirm new journal dialog
// ---------------------------------------------
$("#confirmNewJournal").click(() => {
    let password = $("#password").val();
    // Check passwords not empty and matching, and set pwd.
    if (/^\s*$/.test(password)) {
        $("#newJournalError").html(`<span style="color: red">Password cannot be empty.
            </span>`);
        return;
    }
    if (password !== $("#confirmPassword").val()) {
        $("#newJournalError").html(`<span style="color: red">Passwords do not match.
            </span>`);
        return;
    }
    let pwdStrength = checkPwdStrength(password);
    if (!_.isEqual(pwdStrength, [])) {
        // Not secure enough.
        $("#newJournalError").html("<span style='color: red'>" + pwdStrength[0] + "</span>");
        return;
    }
    pwd = $("#password").val();

    if ($("#confirmNewJournal").text() == "Create New Journal") {
        journalEntries = {};
        journalEntries.en = [];

        alertify.success("Journal created successfully!");

        $("#welcome-page").css("display", "none");
        $("#journal-mode").css("display", "flex");
        currentEntryCount = 0;
    }
    else
        alertify.success("Password changed! Please save your journal again.");
    Metro.dialog.close(document.getElementById("newJournalDialog"));
});

$("#cancelNewJournal").click(() => {
    Metro.dialog.close(document.getElementById("newJournalDialog"));
});

// Handle clicking Decrypt button
$("#decryptJournal").click(() => {
    console.log("[DECRYPT] Decrypt button clicked");
    pwd = $("#unlock").val();
    console.log("[DECRYPT] Password length:", pwd.length);
    console.log("[DECRYPT] Current file version:", currentFileVersion);
    
    if (currentFileVersion == 5.1) {
        // Handle the newer file version.
        let tmp = os.tmpdir();
        console.log("[DECRYPT] Temp directory:", tmp);
        console.log("[DECRYPT] Current file path:", currentFilePath);
        
        async.waterfall([
            (callback) => {
                // Decrypt the file
                console.log("[DECRYPT] Step 1: Decrypting file...");
                $("#save-status").html("Decrypting file (1/3)");
                decryptFile(currentFilePath, tmp + "/_jb.tar.gz", pwd, callback);
            },
            (callback) => {
                // Extract the archive
                console.log("[DECRYPT] Step 2: Decompressing...");
                $("#save-status").html("Decompressing contents (2/3)");
                archiveUtils.decompress(tmp + "/_jb.tar.gz", callback);
            },
            (callback) => {
                // Read the file
                console.log("[DECRYPT] Step 3: Reading contents...");
                $("#save-status").html("Reading contents (3/3)");
                fs.readFile(tmp + "/_jbfiles/data.json", (err, data) => {
                    if (err) {
                        console.error("[DECRYPT] Error reading data.json:", err);
                        throw err;
                    }
                    console.log("[DECRYPT] Data read successfully, length:", data.length);
                    callback(null, data);
                });
            },
            (data, callback) => {
                console.log("[DECRYPT] Step 4: Showing data...");
                journalEntries = data;
                showData(data);
                Metro.dialog.close(document.getElementById("decryptDialog"));
                $("#save-status").html("");
                console.log("[DECRYPT] Decryption complete!");
                callback(null);
            }
        ], (err) => {
            if (err) {
                console.error("[DECRYPT] Error in waterfall:", err);
                $("#prompt").text("Wrong password. Try again.");
                setInterval(() => {
                    $("#prompt").text("");
                }, 3000);
            }
        });
    } else {
        // Legacy 5.0 support
        console.log("[DECRYPT] Processing legacy 5.0 file");
        let data;
        if ((data = getDecryptedText(encryptedData, pwd))) {
            // Successful
            console.log("[DECRYPT] Legacy decryption successful");
            showData(data);
            Metro.dialog.close(document.getElementById("decryptDialog"));

            if (data.version > VERSION_NUMBER)
                alertify.error("This journal is from a newer version. Some features may not work correctly.");
        } else {
            console.log("[DECRYPT] Legacy decryption failed");
        }
    }
});

// -------------------------------
// About menu entry click handlers
// -------------------------------
$("#introButton").click(() => {
    Metro.dialog.open(document.getElementById("introDialog"));
    $(".dialog-overlay").css("background", "rgba(29, 29, 29, 0.7");
});

$("#aboutButton").click(() => {
    Metro.dialog.open(document.getElementById("aboutDialog"));
    $(".dialog-overlay").css("background", "rgba(29, 29, 29, 0.7");
});

// Attachment file input handler
$("#selectFile").on("change", () => {
    console.log("[ATTACHMENT] File input changed");
    let { files } = $("#selectFile")[0];
    console.log("[ATTACHMENT] Number of files:", files.length);
    
    for (let i = 0; i < files.length; ++i) {
        console.log("[ATTACHMENT] Processing file", i, ":", files[i].name);
        console.log("[ATTACHMENT] File object:", files[i]);
        console.log("[ATTACHMENT] File path property:", files[i].path);
        
        // Get the file extension from the name
        let ext = path.extname(files[i].name);
        console.log("[ATTACHMENT] Extension:", ext);
        
        // Get the new filename
        let newFilename = new Date().valueOf().toString();
        newFilename += ("_" + i.toString() + ext);
        console.log("[ATTACHMENT] New filename:", newFilename);

        // Get the new path
        let dir = os.tmpdir() + "/_jbimages";
        if (!fs.existsSync(dir)) {
            console.log("[ATTACHMENT] Creating directory:", dir);
            fs.mkdirSync(dir);
        }

        // Move the file to the right place
        try {
            // In Electron, we can use the path property if available, otherwise we need to handle it differently
            if (files[i].path) {
                // Electron with nodeIntegration provides the path
                console.log("[ATTACHMENT] Using file.path:", files[i].path);
                fs.createReadStream(files[i].path).pipe(fs.createWriteStream(dir + "/" + newFilename));
            } else {
                // Fallback: read the file as buffer and write it
                console.log("[ATTACHMENT] Using FileReader fallback");
                const reader = new FileReader();
                reader.onload = (e) => {
                    const buffer = Buffer.from(e.target.result);
                    fs.writeFileSync(dir + "/" + newFilename, buffer);
                    console.log("[ATTACHMENT] File written via FileReader:", newFilename);
                };
                reader.readAsArrayBuffer(files[i]);
            }

            /* This whole _jbimages folder will later be copied to the _jbfiles directory,
            so we need to actually store a path to the image in the encodedImages (now a
            misnomer) array. Unfortunately, we can't use relative paths, since . refers to
            the current executable's path and not the temp path.

            Update: Fuck that, we need it to work cross-platform, store relative paths.
            Note that . here should be replaced by os.tmpdir() and then it'll work
            alright. */
            let finalPath = "./_jbfiles/images/" + newFilename;

            // Add to the array of attachments
            encodedImages.push(finalPath);
            console.log("[ATTACHMENT] Added to encodedImages:", finalPath);
            console.log("[ATTACHMENT] Total attachments:", encodedImages.length);
        } catch (ex) {
            console.error("[ATTACHMENT] Error adding attachment:", ex);
            alertify.error("We couldn't add your attachments.");
        }
    }
});

// Preview button click handler
$("#preview").click(() => {
    Metro.dialog.open(document.getElementById("previewDialog"));
    $(".dialog-overlay").css("background", "rgba(29, 29, 29, 0.7");
    $("#renderedMarkdown").html(converter.makeHtml($("#entryTextarea").val()));
    emojify.run(document.getElementById("renderedMarkdown"));
});

// Handle "Add NSFW Label" button click
$("#add-nsfw-label").click((e) => {
    e.preventDefault();
    $("#add-nsfw-label").toggleClass("active");
});
