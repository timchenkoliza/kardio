import fs from "node:fs";
import path from "node:path";

const roots = ["app", "components"];
const files = [];

function walk(directory) {
  if (!fs.existsSync(directory)) return;
  for (const entry of fs.readdirSync(directory, { withFileTypes: true })) {
    const file = path.join(directory, entry.name);
    if (entry.isDirectory()) walk(file);
    else if (/\.tsx$/.test(file)) files.push(file);
  }
}

for (const root of roots) walk(root);

const forbidden = [
  { name: "product voice must not prescribe to a person", pattern: /\b(?:мы\s+)?рекомендуем\s+(?:вам|пациенту)\b/iu },
  { name: "no direct treatment command", pattern: /\b(?:назначьте|отмените|прекратите\s+при[её]м|начните\s+при[её]м)\b/iu },
  { name: "no guaranteed medical outcome", pattern: /\bгарантирован(?:но|ный|ная|ные)\b/iu },
  { name: "no absolute diagnostic certainty", pattern: /\b(?:точный|точно)\s+диагноз\b/iu },
  { name: "AI must not claim clinical authority", pattern: /\bИИ\s+(?:поставил\s+диагноз|назначил|решил\s+лечить)\b/iu },
  { name: "no social engagement mechanics in professional UI", pattern: /\b(?:поставить\s+лайк|репост|поделиться\s+с\s+подписчиками)\b/iu },
];

const failures = [];
for (const file of files) {
  const source = fs.readFileSync(file, "utf8");
  for (const rule of forbidden) {
    if (rule.pattern.test(source)) failures.push(`${file}: ${rule.name}`);
  }
}

const requiredBoundaries = [
  ["components/clinical-tools-hub.tsx", "не является диагнозом"],
  ["components/professional-destination-hubs.tsx", "не определяет показания"],
  ["components/oncology-starter-surface.tsx", "без персональных назначений"],
  ["components/product-frame.tsx", "Поисковые фразы не передаются в аналитику"],
  ["components/workspace-professional-intelligence.tsx", "Не передавайте через этот продукт медицинские данные пациента"],
  ["components/workspace-professional-intelligence.tsx", "не ориентир для решения по конкретному пациенту"],
  ["components/drug-intelligence-workspace.tsx", "Демо-данные · синтетические оценки"],
  ["components/drug-intelligence-workspace.tsx", "не попадает в Golden Set"],
  ["components/consilium-workspace.tsx", "Синтетический консилиум · ответы AI-персон"],
  ["components/consilium-workspace.tsx", "Это не медицинское решение за врача"],
  ["components/consilium-workspace.tsx", "Не передавайте персональные данные пациента"],
];

for (const [file, phrase] of requiredBoundaries) {
  const source = fs.existsSync(file) ? fs.readFileSync(file, "utf8") : "";
  if (!source.includes(phrase)) failures.push(`${file}: required communication boundary missing: ${phrase}`);
}

if (failures.length) {
  process.stderr.write(`${failures.join("\n")}\n`);
  process.exitCode = 1;
} else {
  process.stdout.write(`Product copy: ${files.length} user-facing TSX files checked against communication rules.\n`);
}
