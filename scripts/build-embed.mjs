// Builds the copy-paste chat embed: prelude + the shared widget code, plus its CSS.
// Output: public/astadesk-chat.js and public/astadesk-chat.css
import { copyFileSync, readFileSync } from "node:fs";

import { build } from "esbuild";

const contents = readFileSync("widget/embed-prelude.js", "utf8") + "\n" + readFileSync("widget/deskpilot-chat.src.js", "utf8");
await build({
  stdin: { contents, loader: "js", sourcefile: "astadesk-chat.js" },
  outfile: "public/astadesk-chat.js",
  minify: true,
  target: "es2019",
  legalComments: "none",
});
copyFileSync("extensions/deskpilot-chat/assets/deskpilot-chat.css", "public/astadesk-chat.css");
console.log("built public/astadesk-chat.js and public/astadesk-chat.css");
