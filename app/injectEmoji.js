const fs = require("fs");
const path = require("path");

// Disabled no-unused-vars since ESLint won't pick up that
// we used it inside a template literal.
const addEmoji = (name) => { // eslint-disable-line no-unused-vars
    $("textarea").val((i, text) => { // eslint-disable-line no-undef
        return text + `:${name}:`;
    });
};

exports.injectEmojis = (selector) => {
    fs.readdir(path.join(__dirname, "../emoji"), (err, files) => {
        if (err) throw err;
        let html = "<div class='row'>";
        files.forEach((file) => {
            let emoji_name = file.split(".")[0];
            html += `
                <div class="col-md-3">
                    <img class="emoji injected-emoji" src="../emoji/${file}" \
                        onclick="addEmoji('${emoji_name}')" />
                </div>
            `;
        });
        html += "</div>";

        $(selector).html(html); // eslint-disable-line no-undef
    });
};

module.exports = exports;