import fs from "node:fs";
import path from "node:path";

const root = process.cwd();
const tokenFile = "app/styles/tokens.css";
const files = [];
function walk(directory) {
  if (!fs.existsSync(directory)) return;
  for (const entry of fs.readdirSync(directory, { withFileTypes: true })) {
    const file = path.join(directory, entry.name);
    if (entry.isDirectory()) walk(file);
    else if (/\.(css|tsx)$/.test(file)) files.push(file);
  }
}
walk("app");
walk("components");
const failures = [];
const rawColor = /#[\da-f]{3,8}\b|\b(?:rgba?|hsla?|oklch|oklab|color)\s*\(/i;
const controlled = /^(?:font-size|font-family|font-weight|font|(?:border(?:-(?:top|bottom)-(?:left|right))?-radius)|(?:box|text)-shadow)$/;
const controlledAtom = /^(?:var\(--[\w-]+\)|inherit|initial|unset|revert|none|0)$/;
function isControlledTokenValue(value) {
  const normalized = value.trim().replace(/\s*!important$/, "");
  return normalized.split(/\s+/).every((atom) => controlledAtom.test(atom));
}
for (const file of files) {
  if (file === tokenFile) continue;
  const source = fs.readFileSync(path.join(root, file), "utf8");
  const lines = source.split("\n");
  lines.forEach((line, index) => {
    const withoutComments = line.replace(/\/\*.*?\*\//g, "");
    if (file.endsWith(".css") && rawColor.test(withoutComments)) failures.push(`${file}:${index + 1}: raw color belongs in ${tokenFile}`);
    if (file.endsWith(".tsx") && /(?:color|background|fontSize|fontFamily|fontWeight|borderRadius|boxShadow)\s*:/.test(line)) failures.push(`${file}:${index + 1}: design declarations belong in token-backed CSS`);
  });
  if (!file.endsWith(".css")) continue;
  const sourceWithoutComments = source.replace(/\/\*[\s\S]*?\*\//g, "");
  for (const match of sourceWithoutComments.matchAll(/([\w-]+)\s*:\s*([^;{}]+)[;}]/g)) {
    const [, property, value] = match;
    if (property.startsWith("--")) failures.push(`${file}: custom token ${property} must be centralized in ${tokenFile}`);
    if (controlled.test(property) && !isControlledTokenValue(value)) {
      failures.push(`${file}: ${property}: ${value.trim()} must reference semantic tokens`);
    }
    const valueWithoutTokenNames = value.replace(/--[\w-]+/g, "");
    if (/^(?:color|background(?:-color)?|border(?:-color)?|outline(?:-color)?|fill|stroke)$/.test(property) && /\b(?:white|black|red|blue|green|gray|grey|purple|yellow|orange|pink)\b/.test(valueWithoutTokenNames)) {
      failures.push(`${file}: named color in ${property} must reference a token`);
    }
  }
}
if (!fs.existsSync(tokenFile)) failures.push(`Missing design token source: ${tokenFile}`);
if (failures.length) {
  process.stderr.write(`${failures.join("\n")}\n`);
  process.exitCode = 1;
} else {
  process.stdout.write(`Design tokens: ${files.length} active CSS/TSX files checked.\n`);
}
