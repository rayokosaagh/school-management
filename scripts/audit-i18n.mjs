import fs from "node:fs";
import path from "node:path";
import ts from "typescript";

const roots = ["src/app/(auth)", "src/app/dashboard", "src/app/not-found.tsx", "src/components/ui"];
const dictionaryFiles = [
  "src/lib/i18n/translations.ts",
  "src/lib/i18n/nepali-ui.ts",
  "src/lib/i18n/nepali-messages.ts",
];

function filesUnder(entry) {
  const stat = fs.statSync(entry);
  if (stat.isFile()) return [entry];
  return fs.readdirSync(entry, { withFileTypes: true }).flatMap((item) => {
    const target = path.join(entry, item.name);
    return item.isDirectory() ? filesUnder(target) : [target];
  });
}

const dictionary = new Set();
for (const file of dictionaryFiles) {
  const source = fs.readFileSync(file, "utf8");
  for (const match of source.matchAll(/^\s*("(?:[^"\\]|\\.)*"):\s*/gm)) {
    dictionary.add(JSON.parse(match[1]));
  }
}

const decodeEntities = (value) =>
  value
    .replaceAll("&apos;", "'")
    .replaceAll("&quot;", '"')
    .replaceAll("&amp;", "&")
    .replaceAll("&nbsp;", "\u00a0")
    .replaceAll("&ldquo;", "“")
    .replaceAll("&rdquo;", "”")
    .replaceAll("&lsquo;", "‘")
    .replaceAll("&rsquo;", "’");

const normalize = (value) => decodeEntities(value).trim().replace(/\s+/g, " ");
const failures = [];
const textAttributes = new Set(["aria-label", "description", "emptyDescription", "emptyTitle", "eyebrow", "hint", "label", "placeholder", "title"]);
const textProperties = new Set(["description", "detail", "emptyDescription", "emptyTitle", "eyebrow", "hint", "label", "note", "title"]);

function checkDictionary(file, sourceFile, node, value, kind) {
  const key = normalize(value);
  if (/[A-Za-z]/.test(key) && !dictionary.has(key)) {
    failures.push(`${file}:${sourceFile.getLineAndCharacterOfPosition(node.pos).line + 1}: missing Nepali translation for ${kind}: ${JSON.stringify(key)}`);
  }
}

function displayStrings(expression) {
  if (ts.isStringLiteral(expression) || ts.isNoSubstitutionTemplateLiteral(expression)) {
    return [expression.text];
  }
  if (ts.isConditionalExpression(expression)) {
    return [...displayStrings(expression.whenTrue), ...displayStrings(expression.whenFalse)];
  }
  if (ts.isParenthesizedExpression(expression)) return displayStrings(expression.expression);
  if (ts.isTemplateExpression(expression)) {
    return [expression.head.text, ...expression.templateSpans.map((span) => span.literal.text)];
  }
  if (ts.isBinaryExpression(expression) && expression.operatorToken.kind === ts.SyntaxKind.PlusToken) {
    return [...displayStrings(expression.left), ...displayStrings(expression.right)];
  }
  return [];
}

for (const file of roots.flatMap(filesUnder)) {
  if (!file.endsWith(".tsx") || file.includes(".test.")) continue;
  const source = fs.readFileSync(file, "utf8");
  const sourceFile = ts.createSourceFile(file, source, ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);

  function insideTranslatedText(node) {
    for (let parent = node.parent; parent; parent = parent.parent) {
      if (ts.isJsxElement(parent)) {
        return parent.openingElement.tagName.getText(sourceFile) === "TranslatedText";
      }
      if (ts.isSourceFile(parent)) break;
    }
    return false;
  }

  function visit(node) {
    if (ts.isJsxText(node) && /[A-Za-z]/.test(node.text) && !insideTranslatedText(node)) {
      failures.push(`${file}:${sourceFile.getLineAndCharacterOfPosition(node.pos).line + 1}: bare interface text: ${JSON.stringify(normalize(node.text))}`);
    }

    if (
      ts.isJsxElement(node) &&
      node.openingElement.tagName.getText(sourceFile) === "TranslatedText" &&
      node.children.every(ts.isJsxText)
    ) {
      const key = normalize(node.children.map((child) => child.text).join(""));
      checkDictionary(file, sourceFile, node, key, "text");
    }

    if (
      ts.isJsxAttribute(node) &&
      textAttributes.has(node.name.getText(sourceFile)) &&
      node.initializer &&
      ts.isStringLiteral(node.initializer)
    ) {
      checkDictionary(file, sourceFile, node, node.initializer.text, `attribute ${node.name.getText(sourceFile)}`);
    }

    if (
      ts.isJsxExpression(node) &&
      node.expression &&
      (ts.isJsxElement(node.parent) || ts.isJsxFragment(node.parent))
    ) {
      for (const value of displayStrings(node.expression)) {
        checkDictionary(file, sourceFile, node, value, "display expression");
      }
    }

    if (
      ts.isPropertyAssignment(node) &&
      textProperties.has(node.name.getText(sourceFile)) &&
      ts.isStringLiteral(node.initializer)
    ) {
      checkDictionary(file, sourceFile, node, node.initializer.text, `property ${node.name.getText(sourceFile)}`);
    }
    ts.forEachChild(node, visit);
  }
  visit(sourceFile);
}

const messageRoots = ["src/app/dashboard", "src/lib"];
for (const file of messageRoots.flatMap(filesUnder)) {
  if ((!file.endsWith(".ts") && !file.endsWith(".tsx")) || file.includes(".test.")) continue;
  const source = fs.readFileSync(file, "utf8");
  const sourceFile = ts.createSourceFile(file, source, ts.ScriptTarget.Latest, true, file.endsWith(".tsx") ? ts.ScriptKind.TSX : ts.ScriptKind.TS);

  function visitMessage(node) {
    if (
      ts.isPropertyAssignment(node) &&
      ["error", "success"].includes(node.name.getText(sourceFile)) &&
      ts.isStringLiteral(node.initializer)
    ) {
      checkDictionary(file, sourceFile, node, node.initializer.text, `action ${node.name.getText(sourceFile)}`);
    }
    if (
      ts.isNewExpression(node) &&
      node.expression.getText(sourceFile).endsWith("Error") &&
      node.arguments?.length === 1 &&
      ts.isStringLiteral(node.arguments[0])
    ) {
      checkDictionary(file, sourceFile, node, node.arguments[0].text, "user-facing error");
    }
    ts.forEachChild(node, visitMessage);
  }
  visitMessage(sourceFile);
}

if (failures.length) {
  console.error(failures.join("\n"));
  process.exitCode = 1;
} else {
  console.log("All static interface text and action messages have Nepali translations.");
}
