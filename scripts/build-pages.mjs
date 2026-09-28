import { copyFile, cp, mkdir, readdir, rm, writeFile } from "node:fs/promises";
import path from "node:path";

const root = process.cwd();
const output = path.join(root, "dist", "pages");
const redirect = `<!doctype html>
<html lang="zh-CN">
  <head>
    <meta charset="UTF-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1.0" />
    <meta http-equiv="refresh" content="0; url=./draw/" />
    <title>Tarot Draw</title>
  </head>
  <body>
    <p><a href="./draw/">进入塔罗抽牌页面</a></p>
  </body>
</html>
`;

await rm(output, { recursive: true, force: true });
await mkdir(path.join(output, "licenses"), { recursive: true });
await cp(path.join(root, "dist", "ui", "web"), path.join(output, "draw"), {
  recursive: true,
});
const cardSource = path.join(root, "assets", "cards");
const cardOutput = path.join(
  output,
  "assets",
  "cards",
  "midnight-art-nouveau-v1",
);
await mkdir(cardOutput, { recursive: true });
for (const name of await readdir(cardSource)) {
  if (name.endsWith(".webp"))
    await copyFile(path.join(cardSource, name), path.join(cardOutput, name));
}
await writeFile(path.join(output, "index.html"), redirect);
await writeFile(path.join(output, "404.html"), redirect);
await writeFile(path.join(output, ".nojekyll"), "");
await copyFile(
  path.join(root, "LICENSE"),
  path.join(output, "licenses", "LICENSE"),
);
await copyFile(
  path.join(root, "assets", "ASSET_LICENSE.md"),
  path.join(output, "licenses", "ASSET_LICENSE.md"),
);
