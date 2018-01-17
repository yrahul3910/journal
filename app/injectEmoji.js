const fs = require("fs");
const path = require("path");

exports.injectEmojis = (selector) => {
    fs.readdir(path.join(__dirname, "../emoji"), (err, files) => {
        if (err) throw err;
        let html = "<div class='row'>";
        files.forEach((file) => {
            html += `
                <div class="col-md-3">
                    <img class="emoji injected-emoji" src="../emoji/${file}" \
                        onclick="$('textarea').append(':${file.split(".")[0]}:')" />
                </div>
            `;
        });
        html += "</div>";

        $(selector).html(html); // eslint-disable-line no-undef
    });
};

module.exports = exports;
