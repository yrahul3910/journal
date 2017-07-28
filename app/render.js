/* eslint no-undef: 0 */
const { dialog } = require("electron").remote;
const fs = require("fs");
const $ = require("jquery");
const alertify = require("alertify.js");
const crypto = require("crypto");
const owasp = require("owasp-password-strength-test");

const VERSION_NUMBER = 5.0;
// **********************ENCRYPTION PART*****************
// Encryption implemented from https://stackoverflow.com/a/6953606
const algorithm = "aes256";

// openMode has either "Open File" or "New Journal"
let pwd, openMode;
let encryptedData;

// Wrapper functions for encryption
// Note: if emojis are to be supported later, might wanna change UTF-8 with UTF-16
const getEncryptedText = (text) => {
  const cipher = crypto.createCipher(algorithm, pwd);
  return cipher.update(text, "utf8", "hex") + cipher.final("hex");
};

const getDecryptedText = (text) => {
  const decipher = crypto.createDecipher(algorithm, pwd);
  try {
    return decipher.update(text, "hex", "utf8") + decipher.final("utf8");
  } catch(ex) {
    $("#prompt").text("Wrong password. Try again.");
    return undefined;
  } 
};

const checkPwdStrength = (pwd) => {
  owasp.config({
    minLength: 8
  });

  let result = owasp.test(pwd);
  if (result.errors)
    return result.errors;
  else
    return [];
};
// ******************************************************

let journalEntries;
let currentEntryCount;
let encodedImage = ""; // this holds the base64 encoded attachment image of the current entry

// Used to store the HTML of all the entries
let allEntriesHTML;

// from https://stackoverflow.com/a/24526156
function encodeImage(file) {
  let bitmap = fs.readFileSync(file);
  return new Buffer(bitmap).toString("base64");
}

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
  entryHTML += "<p>" + selectedEntry.content + "</p>";
  $("#content").html(entryHTML);

  // From https://stackoverflow.com/a/26332690
  if (selectedEntry.attachment)
    $("<img>", {
      "src": "data:image/png;base64," + selectedEntry.attachment,
      // added `width` , `height` properties to `img` attributes
      "width": "250px"})
      .appendTo("#content");
};

$("#open").click(() => {
  dialog.showOpenDialog({ filters: [
    { name: "Journal 4.0 Document", extensions: ["journalx"] },
    { name: "Journal 5.0 Document", extensions: ["ejournal"]}
  ]}, (filenames) => {
    if (filenames === undefined) return;

    let oldVersion;
    if (filenames[0].endsWith("journalx")) {
      // TODO: Need a better way of finding version
      // Notify user of new format, ask for password.
      oldVersion = true;
      const disclaimer = "Thank you for choosing Journal. The new version will now be " +
          "encrypted by AES-256. Please enter a password to continue.";
      $("#encryptionNotice").text(disclaimer);

      metroDialog.open("#newJournalDialog");
      openMode = "Open File";
      $(".dialog-overlay").css("background", "rgba(29, 29, 29, 0.7");
    }
      
    encryptedData = fs.readFileSync(filenames[0]).toString();
    if (!oldVersion) {
      metroDialog.open("#decryptDialog");
      $(".dialog-overlay").css("background", "rgba(29, 29, 29, 0.7");
    } else {
      showData(encryptedData); // In the old format it's not really encrypted.
    }
  });
});

$("#save").click(() => {
  dialog.showSaveDialog({ filters: [
    { name: "Journal 5.0 Document", extensions: ["ejournal"] }
  ]}, (filename) => {
    if (!filename) return;

    journalEntries.version = VERSION_NUMBER;
    let data = JSON.stringify(journalEntries);
    fs.writeFile(filename, getEncryptedText(data), (err) => {
      if (err) {
        dialog.showErrorBox("Could not save file.", "We couldn't save the journal file. Make sure you have the required permisssions to do so.");
        return;
      }
      alertify.success("Saved successfully!");
    });
  });
});

// New entry menu item click event handler
$("#newEntry").click(() => {
  if (!journalEntries) {
    metroDialog.open("#errDialog");
    return;
  }

  $("#date").val(new Date().toISOString().slice(0, 10));
  metroDialog.open("#editDialog");
  $(".dialog-overlay").css("background", "rgba(29, 29, 29, 0.7");
});

// New entry dialog button click handlers
$("#addEntry").click(() => {
  let date = new Date($("#date").val());
  let content = $("textarea").val();

  // Make sure this isn't a duplicate entry.
  for (let i = 0; i < currentEntryCount; ++i) {
    if (date.getTime() === new Date(journalEntries.en[i].entryDate).getTime()) {
      alertify.error("Multiple entries for the same date not allowed.");
      return;
    }
  }

  let sentiment = $("select").val();
  // Add the entry to the list of entries  
  let newEntry = { entryDate: date, content, attachment: encodedImage, sentiment };
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

  // We need to rebind this handler
  $(".entry").click((e) => {
    onEntryClicked(e, journalEntries.en);
  });
  metroDialog.close("#editDialog");

  $("textarea").val("");
});

$("#cancelEntry").click(() => {
  metroDialog.close("#editDialog");
  $("textarea").val("");
});


$("#newJournal").click(() => {
  openMode = "New Journal";
  metroDialog.open("#newJournalDialog");
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
      if (journalEntries.en[i].content.includes(query)) {
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
      $("<img>", {
        "src": "data:image/png;base64," + selectedEntry.attachment,
        // added `width` , `height` properties to `img` attributes
        "width": "250px"})
        .appendTo("#content");
    });

    alertify.delay(6000).log("Click the Journal button in the menu to return to all entries.");
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
    alertify.error("Password cannot be empty.");
    return;
  }
  if (password !== $("#confirmPassword").val()) {
    alertify.error("Passwords do not match.");
    return;
  }
  let pwdStrength = checkPwdStrength(password);
  if (pwdStrength) {
    // Not secure enough.
    alertify.error(pwdStrength[0]);
    return;
  }
  pwd = $("#password").val();

  if (openMode === "New Journal") {
    journalEntries = { };
    journalEntries.en = [];

    alertify.success("Journal created successfully!");
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
  let data;
  if ((data = getDecryptedText(encryptedData))) {
    // Successful
    showData(data);
    metroDialog.close("#decryptDialog");
  }
});

$("#aboutButton").click(() => {
  metroDialog.open("#aboutDialog");
  $(".dialog-overlay").css("background", "rgba(29, 29, 29, 0.7");
});

$("#selectFile").on("change", () => {
  const filename = $("#selectFile")[0].files[0].path;
  encodedImage = encodeImage(filename);
});
