import type { Rule } from "../types";
import { r00 } from "./r00-page-load";
import { r01 } from "./r01-palette";
import { r02 } from "./r02-contrast";
import { r03 } from "./r03-line-height";
import { r04 } from "./r04-font-size";
import { r05 } from "./r05-touch-target";
import { r06 } from "./r06-axe";
import { r07 } from "./r07-headings";
import { r08 } from "./r08-copyright";
import { r09 } from "./r09-banned-copy";
import { r10 } from "./r10-nbsp";
import { r11 } from "./r11-css-tokens";
import { r12 } from "./r12-specialty-leak";
import { r13 } from "./r13-focus";

/** Bump when rules are added, removed or change what they report. */
export const RULESET_SEMVER = "1.0.0";

export const RULES: readonly Rule[] = [r00, r01, r02, r03, r04, r05, r06, r07, r08, r09, r10, r11, r12, r13];

export const ruleById = (id: string) => RULES.find(rule => rule.id === id);
