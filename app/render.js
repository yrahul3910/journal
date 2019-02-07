/* eslint no-undef: 0 */
// Required for opening dialogs and context menus
const remote = require("electron").remote;
const { dialog, Menu, MenuItem } = remote;
const window = remote.getCurrentWindow();

const fs = require("fs");
const fse = require("fs-extra");
const os = require("os");
const path = require("path");
const $ = require("jquery");
const async = require("async");
const alertify = require("alertify.js");
const emojify = require("emojify.js");
const archiveUtils = require("./archive");
const { injectEmojis } = require("./injectEmoji");
const rimraf = require("rimraf");
const { Chart } = require("chart.js");
const { getDecryptedText, checkPwdStrength, encryptFile, decryptFile } = require("./encryption");

const _ = require("lodash");
const moment = require("moment");
const showdown = require("showdown");

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
    click() {
        dialog.showOpenDialog({
            title: "Choose a folder",
            properties: ["openDirectory"]
        }, (paths) => {
            if (paths) {
                let filename = globalStore.imgPath.slice(globalStore.imgPath.lastIndexOf("/"));
                fse.copy(globalStore.imgPath, paths[0] + filename, (err) => {
                    if (err) alertify.error("Failed to save image");
                    else alertify.success("Saved image successfully.");
                });
            }
        });
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
    let html = "";
    for (let i = 0; i < currentEntryCount; ++i) {
        let sentiment = (json[i].sentiment ? json[i].sentiment : "Neutral");
        html += "<div class='entry' id='" + i + "'><b>";
        html += new Date(json[i].entryDate).toDateString() + "</b>";
        html += `<span>  </span><span class='sentiment ${sentiment}'> </span>\
            <span style='color: ${sentiments[sentiment]}; font-size: 12px'>${sentiment}</span>`
        if (json[i].nsfw)
            html += `<span class="nsfw">NSFW</span>`;
        html += `<br/><p>`;
        let entry = json[i].content;

        let words = entry.split(/\s+/).slice(0, 5).join(" ");
        html += words + "...</p></div><hr />";
    }
    $("#list").html(html);
    allEntriesHTML = html;

    $(".entry").click((e) => {
        onEntryClicked(e, json);
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

    // Hide the emoji box
    $("#emoji-picker").slideToggle();
    $("#emoji-toggle-img").click(() => {
        $("#emoji-picker").slideToggle();
    });

    // Set the theme here
    let theme = localStorage.getItem("theme");
    if (!theme) {
        // Check if it exists
        localStorage.setItem("theme", "default");
    } else if (theme == "dark") {
        $("body").addClass("dark-theme");
        $("button:not(.alert)").addClass("dark");
        document.getElementById("darkThemeEnable").checked = true;
    }
});

// -----------------------
// Titlebar event handlers
// -----------------------
$("#minimize").click(() => {
    window.minimize();
});

$("#close").click(() => {
    window.close();
});

// Toggle dark theme and save preferences
$("#darkThemeEnable").on("change", () => {
    if ($("#darkThemeEnable").is(":checked")) {
        $("body").addClass("dark-theme");
        $("button:not(.alert)").addClass("dark");
        localStorage.setItem("theme", "dark");
    } else {
        $("body").removeClass("dark-theme");
        $("button:not(.alert)").removeClass("dark");
        localStorage.setItem("theme", "default");
    }
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
$("#open").click(() => {
    dialog.showOpenDialog({
        filters: [
            { name: "JournalBear 5.1 Document", extensions: ["zjournal"] },
            { name: "JournalBear 5.0 Document", extensions: ["ejournal"] }
        ]
    }, (filenames) => {
        if (filenames === undefined) return;

        if (filenames[0].endsWith(".ejournal"))
            currentFileVersion = 5.0;
        else {
            currentFilePath = filenames[0];
            currentFileVersion = 5.1;
        }

        $("#welcome-page").css("display", "none");
        $("#journal-mode").css("display", "flex");

        encryptedData = fs.readFileSync(filenames[0]).toString();
        Metro.dialog.open(document.getElementById("decryptDialog"));
        $(".dialog-overlay").css("background", "rgba(29, 29, 29, 0.7");
    });
});

$("#save").click(() => {
    dialog.showSaveDialog({
        filters: [
            { name: "JournalBear 5.1 Document", extensions: ["zjournal"] }
        ]
    }, (filename) => {
        if (!filename) return;

        journalEntries.version = VERSION_NUMBER;
        let journalDir = os.tmpdir() + "/_jbfiles";
        if (fs.existsSync(journalDir))
            fse.removeSync(journalDir + "/data.json");
        else
            fs.mkdirSync(journalDir);

        async.waterfall([
            (callback) => {
                // Write the JSON file
                $("#save-status").html("Writing data (1/4)");
                fs.writeFile(journalDir + "/data.json", JSON.stringify(journalEntries), callback);
            },
            (callback) => {
                // Add the images now
                $("#save-status").html("Adding images (2/4)");
                if (fs.existsSync(os.tmpdir() + "/_jbimages"))
                    fse.copy(os.tmpdir() + "/_jbimages", journalDir + "/images", callback);
                else
                    callback(null);
            },
            (callback) => {
                // Create the .tar.gz
                $("#save-status").html("Compressing (3/4)");
                archiveUtils.compress(journalDir, (err, tmpPath) => {
                    if (err) callback(err);
                    callback(null, tmpPath);
                });
            },
            (tmpPath, callback) => {
                // Encrypt the file
                $("#save-status").html("Encrypting (4/4)");
                encryptFile(tmpPath, filename, pwd, callback);
            },
            (callback) => {
                // Display success message
                $("#save-status").html("");
                alertify.success("Successfully saved!");
                callback(null);
            }
        ], (err) => {
            if (err) console.log(err);
        });
    });
});

$("#export").click(() => {
    dialog.showSaveDialog({
        filters: [
            { name: "HTML Page", extensions: ["html"] }
        ]
    }, (filename) => {
        if (!filename) return;

        let journalDir = os.tmpdir() + "/_jbfiles";

        // Obtain the directory to save to
        let path = filename.split("/");
        path.pop();
        path = path.join("/");

        // Start by moving the images
        if (fse.existsSync(path + "/_jbimages"))
            rimraf(path + "/_jbimages");
        fse.moveSync(journalDir + "/images", path + "/_jbimages");

        // HTML code
        element = $("<div />");

        // Create the HTML code necessary
        for (let entry of journalEntries.en) {
            let entry = journalEntries.en[0];
            let entryHTML = getContentHtml(entry);
            element.append(entryHTML);

            // Some older versions had 'Attachment' as the key.
            let attachment = entry.attachment || entry.Attachment;
            let attachmentElement = getAttachmentHtml(attachment, path);
            element.append(attachmentElement);
        }

        // Write out the HTML
        let html = element.prop("outerHTML");
        fs.writeFileSync(filename, html);
    });
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
});

$("#updateEntry").click(() => {
    if (!journalEntries) {
        Metro.dialog.open(document.getElementById("errDialog"));
        return;
    }

    Metro.dialog.open(document.getElementById("editDialog"));

    // Make required changes to fields.
    $("#addEntry").text("Update Entry");
    $("#date").attr("disabled", true);
    // Disallow changes to the attachment
    $("#attachmentInput").css("display", "none");

    let dateString = $("#content :nth-child(1) :nth-child(1)").text().split("\n")[0];

    let date = new Date(dateString);
    let entry = journalEntries.en.find((entry) => {
        return moment(date).isSame(new Date(entry.entryDate), "day");
    });

    $("#date").val(moment(date).format("YYYY-M-D"));
    $("select").val(entry.sentiment);
    $("#entryTextarea").val(entry.content);
});

// Search click handler
$("#search").click(() => {
    Metro.dialog.open(document.getElementById("searchDialog"));
    $(".dialog-overlay").css("background", "rgba(29, 29, 29, 0.7");
});

// Search button click handler
$("#searchButton").click(() => {
    let hasAttachment = $("#hasAttachment").prop("checked");
    let query = $("#searchQuery").val();
    let sentiment = $("#searchSentiment").val();

    Metro.dialog.close(document.getElementById("searchDialog"));

    /* Show the entries which match the query in #list. We prompt the user
    to click the Journal button in the menu to get back to all entries,
    which we've stored in the allEntriesHTML variable. */
    $("#content").html("");

    let queryResults = [], html = "", resultCount = 0;
    for (let i = 0; i < journalEntries.en.length; ++i) {
        let entry = journalEntries.en[i];
        if (new RegExp(query).test(entry.content) && 
            (entry.sentiment == sentiment) &&
            ((entry.attachment || entry.Attachment) == hasAttachment)) {
            queryResults.push(journalEntries.en[i]);

            html += "<div class='queryResult' id='" + resultCount + "'><b>";
            html += new Date(journalEntries.en[i].entryDate).toDateString() + "</b><br/><p>";
            let words = journalEntries.en[i].content.split(/\s+/).slice(0, 5).join(" ");
            html += words + "...</p></div><hr />";

            resultCount += 1;
        }
    }
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
    Metro.dialog.open(document.getElementById("sentimentDialog"));
    $(".dialog-overlay").css("background", "rgba(29, 29, 29, 0.7");

    // Populate the select with the unique years that the user has
    // added entries. Sort the years in descending order.
    let entries = journalEntries.en;
    let years = entries.map(x => moment(x.entryDate).year());
    let uniqueYears = [...new Set(years)].sort().reverse();
    for (let year of uniqueYears)
        $("#sentimentYearsSelect").append(`<option>${year}</option>`);

    // Show the total entry count
    $("#totalEntriesCount").html(entries.length);

    percentages = getEmotionPercentages();
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
    let nsfw = $("p#add-nsfw-label").hasClass("active");

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
    encodedImages = [];
});

$("#cancelEntry").click(() => {
    Metro.dialog.close(document.getElementById("editDialog"));
    $("#entryTextarea").val("");
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
    pwd = $("#unlock").val();
    if (currentFileVersion == 5.1) {
        // Handle the newer file version.
        let tmp = os.tmpdir();
        async.waterfall([
            (callback) => {
                // Decrypt the file
                $("#save-status").html("Decrypting file (1/3)");
                decryptFile(currentFilePath, tmp + "/_jb.tar.gz", pwd, callback);
            },
            (callback) => {
                // Extract the archive
                $("#save-status").html("Decompressing contents (2/3)");
                archiveUtils.decompress(tmp + "/_jb.tar.gz", callback);
            },
            (callback) => {
                // Read the file
                $("#save-status").html("Reading contents (3/3)");
                fs.readFile(tmp + "/_jbfiles/data.json", (err, data) => {
                    if (err) throw err;
                    callback(null, data);
                });
            },
            (data, callback) => {
                journalEntries = data;
                showData(data);
                Metro.dialog.close(document.getElementById("decryptDialog"));
                $("#save-status").html("");
                callback(null);
            }
        ], (err) => {
            if (err) {
                $("#prompt").text("Wrong password. Try again.");
                setInterval(() => {
                    $("#prompt").text("");
                }, 3000);
            }
        });
    } else {
        // Legacy 5.0 support
        let data;
        if ((data = getDecryptedText(encryptedData, pwd))) {
            // Successful
            showData(data);
            Metro.dialog.close(document.getElementById("decryptDialog"));

            if (data.version > VERSION_NUMBER)
                alertify.error("This journal is from a newer version. Some features may not work correctly.");
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
    let { files } = $("#selectFile")[0];
    for (let i = 0; i < files.length; ++i) {
        // Get the new filename
        let newFilename = new Date().valueOf().toString();
        newFilename += ("_" + i.toString() + path.extname(files[i].path));

        // Get the new path
        let dir = os.tmpdir() + "/_jbimages";
        if (!fs.existsSync(dir))
            fs.mkdirSync(dir);

        // Move the file to the right place
        try {
            fs.createReadStream(files[i].path).pipe(fs.createWriteStream(dir + "/" + newFilename));

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
        } catch (ex) {
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
$("p#add-nsfw-label").click(() => {
    $("p#add-nsfw-label").toggleClass("active");
});