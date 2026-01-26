import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";
import { dirname } from "path";

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

/**
 * Inject emojis from a folder to an element.
 * @param {string} selector - The query selector for the element to inject into
 * @param {string} folder - The relative directory path to fetch the emojis
 */
export const injectEmojis = (selector, folder) => {
    fs.readdir(path.join(__dirname, folder), (err, files) => {
        if (err) throw err;
        let html = "<div class='row'>";
        files.forEach((file) => {
            if (!fs.lstatSync(path.join(__dirname, folder, file)).isDirectory()) {
                let emoji_name = file.split(".")[0];
                html += `
                    <div class="col-md-3">
                        <img class="emoji injected-emoji" src="${folder}/${file}" \
                            onclick="$('textarea').val((i, text) => text + ':${emoji_name}:')" />
                    </div>
                `;
            }
        });
        html += "</div>";

        $(selector).html(html); // eslint-disable-line no-undef
    });
};
