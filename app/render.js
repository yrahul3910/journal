/* eslint no-undef: 0 */
const { dialog } = require("electron").remote;
const fs = require("fs");
const os = require("os");
const $ = require("jquery");
const async = require("async");
const alertify = require("alertify.js");
const rimraf = require("rimraf");
const archiveUtils = require("./archive");
const {getEncryptedText, getDecryptedText, checkPwdStrength, encryptFile, decryptFile} = require("./encryption");

const _ = require("lodash");
const moment = require("moment");
const showdown = require("showdown");

const converter = new showdown.Converter({
    literalMidWordUnderscores: true,
    literalMidWordAsterisks: true,
    tables: true,
    strikethrough: true,
    tasklists: true,
    simpleLineBreaks: true,
    simplifiedAutoLink: true,
    openLinksInNewWindow: true,
    emoji: true,
    backslashEscapesHTMLTags: true
});

const VERSION_NUMBER = 5.1;
// openMode has either "Open File" or "New Journal"
let openMode, encryptedData, pwd, currentFileVersion, currentFilePath;

let journalEntries;
let currentEntryCount;
let encodedImages = []; // this holds the base64 encoded attachment images of the current entry

// Used to store the HTML of all the entries
let allEntriesHTML;

function showData(data) {
    // Clear the list
    $("#list").html("");
    let json = JSON.parse(data).en;
    currentEntryCount = json.length;
    journalEntries = JSON.parse(data);
    let html = "";
    for (let i = 0; i < currentEntryCount; ++i) {
        html += "<div class='entry' id='" + i + "'><b>";
        html += new Date(json[i].entryDate).toDateString() + "</b>" +
      "<span>  </span><span class='sentiment " + (json[i].sentiment ? json[i].sentiment : "Neutral") +
      "'></span><br/><p>";
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

const onEntryClicked = (e, json) => {
    const id = e.currentTarget.id;
    const selectedEntry = json[+id];
    // selectedEntry.attachment, content, entryDate are the properties
    let entryHTML = "<p><b>" + (new Date(selectedEntry.entryDate).toDateString()) + "</b>" +
    "<span>  </span><span class='sentiment " +
    (selectedEntry.sentiment ? selectedEntry.sentiment : "Neutral") + "'></span></p>";
    entryHTML += "<p>" + converter.makeHtml(selectedEntry.content) + "</p>";
    $("#content").html(entryHTML);

    // From https://stackoverflow.com/a/26332690
    if (selectedEntry.attachment) {
        if (selectedEntry.attachment instanceof Array) {
            for (let img of selectedEntry.attachment)
                $("<img>", {
                    "src": (img.startsWith("data:image") ? "" : "data:image/png;base64,") + img,
                    // added `width` , `height` properties to `img` attributes
                    "style": "max-width: 250px; max-height: 250px"
                }).appendTo("#content");
        } else {
            // For backward compatibility
            $("<img>", {
                "src": "data:image/png;base64," + selectedEntry.attachment,
                // added `width` , `height` properties to `img` attributes
                "width": "250px"
            }).appendTo("#content");
        }
    }
};

$("#open").click(() => {
    dialog.showOpenDialog({ filters: [
        { name: "JournalBear 5.1 Document", extensions: ["zjournal"]},
        { name: "JournalBear 5.0 Document", extensions: ["ejournal"]}
    ]}, (filenames) => {
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
        metroDialog.open("#decryptDialog");
        $(".dialog-overlay").css("background", "rgba(29, 29, 29, 0.7");
    });
});

$("#save").click(() => {
    dialog.showSaveDialog({ filters: [
        { name: "JournalBear 5.1 Document", extensions: ["zjournal"] }
    ]}, (filename) => {
        if (!filename) return;

        journalEntries.version = VERSION_NUMBER;
        let journalDir = os.tmpdir() + "/_jbfiles";

        // TODO: Need to add a function to add image files
        async.waterfall([
            (callback) => {
                // If it exists, delete the journal directory
                if (fs.existsSync(journalDir))
                    rimraf(journalDir, (err) => {
                        if (err) throw err;
                        callback(null);
                    });
                else
                    callback(null);
            },
            (callback) => {
                // Create a fresh journal directory
                fs.mkdir(journalDir, callback);
            },
            (callback) => {
                // Write the JSON file
                fs.writeFile(journalDir + "/data.json", JSON.stringify(journalEntries), callback);
            },
            (callback) => {
                // Create the .tar.gz
                archiveUtils.compress(journalDir, (err, tmpPath) => {
                    if (err) callback(err);
                    callback(null, tmpPath);
                });
            },
            (tmpPath, callback) => {
                // Encrypt the file
                encryptFile(tmpPath, filename, pwd, callback);
            },
            (callback) => {
                // Display success message
                alertify.success("Successfully saved!");
            }
        ]);
    });
});

// New entry menu item click event handler
$("#newEntry").click(() => {
    if (!journalEntries) {
        metroDialog.open("#errDialog");
        return;
    }

    // First undo any changes that clicking the Update Entry menu item
    // might've done.
    $("#addEntry").text("Add Entry");
    $("#date").attr("disabled", false);
    $("#attachmentInput").css("display", "block");

    $("#date").val(new Date().toISOString().slice(0, 10));
    metroDialog.open("#editDialog");
    $(".dialog-overlay").css("background", "rgba(29, 29, 29, 0.7");
});

// New entry dialog button click handlers
$("#addEntry").click(() => {
    let date = new Date($("#date").val());
    let content = $("textarea").val();

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

    let sentiment = $("select").val();
    // Add the entry to the list of entries
    let newEntry = { entryDate: date, content, attachment: encodedImages, sentiment };

    if (isNewEntry) {
        journalEntries.en.push(newEntry);

        // Show the entry in #list.
        let html = "";
        html += "<div class='entry' id='" + currentEntryCount + "'><b>";
        html += date.toDateString() + "</b><span>  </span><span class='sentiment " +
        sentiment + "'></span><br/><p>";
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
    metroDialog.close("#editDialog");

    $("textarea").val("");
    $("#selectFile").val("");
    encodedImages = [];
});

$("#updateEntry").click(() => {
    metroDialog.open("#editDialog");

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
    $("textarea").val(entry.content);
});

$("#cancelEntry").click(() => {
    metroDialog.close("#editDialog");
    $("textarea").val("");
});


$("#newJournal").click(() => {
    openMode = "New Journal";
    metroDialog.open("#newJournalDialog");
    $("#password").val("");
    $("#confirmPassword").val("");
    $(".dialog-overlay").css("background", "rgba(29, 29, 29, 0.7");
});

// Search
$("#queryInput").on("keyup", (e) => {
    if (e.keyCode === 13) {
        let query = $("#queryInput").val();
        $("#queryInput").val("");

        /* Show the entries which match the query in #list. We prompt the user
        to click the Journal button in the menu to get back to all entries,
        which we've stored in the allEntriesHTML variable. */
        $("#content").html("");

        let queryResults = [], html = "", resultCount = 0;
        for (let i = 0; i < journalEntries.en.length; ++i) {
            if (new RegExp(query).test(journalEntries.en[i].content)) {
                resultCount += 1;
                queryResults.push(journalEntries.en[i]);

                html += "<div class='queryResult' id='" + resultCount + "'><b>";
                html += new Date(journalEntries.en[i].entryDate).toDateString() + "</b><br/><p>";
                let words = journalEntries.en[i].content.split(/\s+/).slice(0, 5).join(" ");
                html += words + "...</p></div><hr />";
            }
        }
        $("#list").html(html);
        $(".queryResult").click((e) => {
            const id = e.currentTarget.id;
            const selectedEntry = queryResults[+id];

            let entryHTML = "<p><b>" + (new Date(selectedEntry.entryDate).toDateString()) + "</b></p>";
            entryHTML += "<p>" + selectedEntry.content + "</p>";

            $("#content").html(entryHTML);
            if (selectedEntry.attachment instanceof Array) {
                for (let img of selectedEntry.attachment) {
                    $("<img>", {
                        "src": "data:image/png;base64," + img,
                        // added `width` , `height` properties to `img` attributes
                        "width": "250px"
                    }).appendTo("#content");
                }
            } else {
                // For backward compatibility
                $("<img>", {
                    "src": "data:image/png;base64," + selectedEntry.attachment,
                    // added `width` , `height` properties to `img` attributes
                    "width": "250px"
                }).appendTo("#content");
            }
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
    }
});

$("#queryInput").blur(() => {
    // Triggered when it loses focus
    $("#queryInput").val("");
});

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

    if (openMode === "New Journal") {
        journalEntries = { };
        journalEntries.en = [];

        alertify.success("Journal created successfully!");

        $("#welcome-page").css("display", "none");
        $("#journal-mode").css("display", "flex");
        currentEntryCount = 0;
    }
    metroDialog.close("#newJournalDialog");
});

$("#cancelNewJournal").click(() => {
    if (openMode === "Open File") {
        $("#list").html("");
        currentEntryCount = 0;
        journalEntries = undefined;
    }
    metroDialog.close("#newJournalDialog");
});

$("#decryptJournal").click(() => {
    pwd = $("#unlock").val();
    if (currentFileVersion == 5.1) {
        // Handle the newer file version.
        let tmp = os.tmpdir();
        console.log(tmp);
        async.waterfall([
            (callback) => {
                // Decrypt the file
                decryptFile(currentFilePath, tmp + "/_jb.tar.gz", pwd, callback);
            },
            (callback) => {
                // Extract the archive
                archiveUtils.decompress(tmp + "/_jb.tar.gz", callback);
            },
            (callback) => {
                // Read the file
                fs.readFile(tmp + "/_jbfiles/data.json", (err, data) => {
                    if (err) callback(err);
                    callback(null, data);
                });
            },
            (data, callback) => {
                journalEntries = data;
                showData(data);
                metroDialog.close("#decryptDialog");
                callback(null);
            }
        ]);
    } else {
        let data;
        if ((data = getDecryptedText(encryptedData, pwd))) {
            // Successful
            showData(data);
            metroDialog.close("#decryptDialog");

            if (data.version > VERSION_NUMBER)
                alertify.error("This journal is from a newer version. Some features may not work correctly.");
        }
    }
});

$("#introButton").click(() => {
    metroDialog.open("#introDialog");
    $(".dialog-overlay").css("background", "rgba(29, 29, 29, 0.7");
});

$("#aboutButton").click(() => {
    metroDialog.open("#aboutDialog");
    $(".dialog-overlay").css("background", "rgba(29, 29, 29, 0.7");
});

$("#selectFile").on("change", () => {
    for (let filename of $("#selectFile")[0].files) {
        // from https://stackoverflow.com/a/30903360/2713263
        // resize the image first
        let canvas = document.createElement("canvas");
        let ctx = canvas.getContext("2d");
        let maxW = 250, maxH = 250;

        let img = new Image();
        img.onload = () => {
            let iw = img.width;
            let ih = img.height;
            let scale = Math.min((maxW / iw), (maxH / ih));
            let iwScaled = iw * scale;
            let ihScaled = ih * scale;
            canvas.width = iwScaled;
            canvas.height = ihScaled;
            ctx.drawImage(img, 0, 0, iwScaled, ihScaled);
            encodedImages.push(canvas.toDataURL());
        };
        img.src = filename.path;
    }
});

$("#preview").click(() => {
    metroDialog.open("#previewDialog");
    $(".dialog-overlay").css("background", "rgba(29, 29, 29, 0.7");
    $("#renderedMarkdown").html(converter.makeHtml($("textarea").val()));
});

$("#searchByDate").click(() => {
    metroDialog.open("#searchDialog");
    $(".dialog-overlay").css("background", "rgba(29, 29, 29, 0.7");
});

$("#searchButton").click(() => {
    let entries = journalEntries.en;

    for (let entry of entries) {
        if (new Date(entry.entryDate).toDateString() ==
            new Date($("#searchDate").val()).toDateString()) {

            $("#content").html("");

            let html = "";
            html += "<div class='queryResult'><b>";
            html += new Date(entry.entryDate).toDateString() + "</b><br/><p>";
            let words = entry.content.split(/\s+/).slice(0, 5).join(" ");
            html += words + "...</p></div><hr />";

            $("#list").html(html);
            $(".queryResult").click(() => {
                let entryHTML = "<p><b>" + (new Date(entry.entryDate).toDateString()) + "</b></p>";
                entryHTML += "<p>" + entry.content + "</p>";

                $("#content").html(entryHTML);
                if (entry.attachment instanceof Array) {
                    for (let img of entry.attachment) {
                        $("<img>", {
                            "src": "data:image/png;base64," + img,
                            // added `width` , `height` properties to `img` attributes
                            "width": "250px"
                        }).appendTo("#content");
                    }
                } else {
                    // For backward compatibility
                    $("<img>", {
                        "src": "data:image/png;base64," + entry.attachment,
                        // added `width` , `height` properties to `img` attributes
                        "width": "250px"
                    }).appendTo("#content");
                }
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

            break;
        }
    }
});
