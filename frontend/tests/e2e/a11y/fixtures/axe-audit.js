/**
 * Accessibility audits for the end-to-end suite (CLV-65).
 *
 * Every audit runs axe-core against the page and fails on serious or critical
 * violations. Moderate and minor findings are recorded (attached to the test
 * report and printed) rather than failing the build, so the baseline can be
 * tracked without blocking unrelated PRs.
 *
 * Colour contrast is deliberately excluded: the theme contrast contract is
 * tested separately (PR #197), and duplicating it here would report every
 * intentional theme pairing twice.
 */

import AxeBuilder from "@axe-core/playwright";
import { expect, test as base } from "@playwright/test";

/** WCAG rules only — best-practice rules are advisory and mostly moderate. */
export const AXE_TAGS = ["wcag2a", "wcag2aa", "wcag21a", "wcag21aa", "wcag22aa"];

/** Owned by the theme contrast suite; not audited here. */
export const AXE_EXCLUDE_RULES = ["color-contrast"];

const IMPACTS = ["critical", "serious", "moderate", "minor"];

const collapse = nodes =>
  nodes.map(node => ({
    target: node.target.join(" "),
    html: node.html,
    summary: node.failureSummary,
  }));

/**
 * Run axe and split the results by impact.
 *
 * @param {import('@playwright/test').Page} page
 * @param {{ include?: string[], exclude?: string[] }} [options]
 */
export async function auditPage(page, options = {}) {
  let builder = new AxeBuilder({ page }).withTags(AXE_TAGS).disableRules(AXE_EXCLUDE_RULES);
  for (const selector of options.include || []) builder = builder.include(selector);
  for (const selector of options.exclude || []) builder = builder.exclude(selector);

  const results = await builder.analyze();
  const byImpact = Object.fromEntries(IMPACTS.map(impact => [impact, []]));

  for (const violation of results.violations) {
    const impact = IMPACTS.includes(violation.impact) ? violation.impact : "minor";
    byImpact[impact].push({
      id: violation.id,
      impact: violation.impact,
      help: violation.help,
      helpUrl: violation.helpUrl,
      nodes: collapse(violation.nodes),
    });
  }

  return byImpact;
}

/**
 * Audit the page; fail on serious/critical, record everything else.
 *
 * @param {import('@playwright/test').Page} page
 * @param {import('@playwright/test').TestInfo} testInfo
 * @param {string} label  where the audit ran, e.g. "kiosk/dark: Dashboard"
 * @param {{ include?: string[], exclude?: string[] }} [options]
 */
export async function expectAccessible(page, testInfo, label, options = {}) {
  const byImpact = await auditPage(page, options);
  const blocking = [...byImpact.critical, ...byImpact.serious];
  const advisory = [...byImpact.moderate, ...byImpact.minor];

  if (advisory.length) {
    await testInfo.attach(`axe-advisory-${label}.json`, {
      body: JSON.stringify(advisory, null, 2),
      contentType: "application/json",
    });
    for (const violation of advisory) {
      console.log(
        `[a11y:${violation.impact}] ${label}: ${violation.id} — ${violation.help} (${violation.nodes.length} node(s))`
      );
    }
  }

  const summary = blocking
    .map(
      violation =>
        `${violation.impact} ${violation.id}: ${violation.help}\n` +
        violation.nodes.map(node => `  ${node.target}\n    ${node.summary}`).join("\n")
    )
    .join("\n\n");

  expect(blocking, `Accessibility violations in ${label}:\n\n${summary}`).toEqual([]);
}

/**
 * Shared test fixture: axe audits plus the console-error collector the rest of
 * the end-to-end suite uses.
 */
export const test = base.extend({
  consoleErrors: async ({ page }, use) => {
    const errors = [];
    const ignored = [/favicon\.ico/i, /\[vite\]/i, /ResizeObserver loop/i];
    const isIgnored = text => ignored.some(pattern => pattern.test(text || ""));

    page.on("console", message => {
      if (message.type() !== "error") return;
      const location = message.location()?.url || "";
      if (isIgnored(message.text()) || isIgnored(location)) return;
      errors.push(`${message.text()}${location ? ` (${location})` : ""}`);
    });
    page.on("pageerror", error => {
      if (isIgnored(error.message || "")) return;
      errors.push(`pageerror: ${error.message}`);
    });

    await use(errors);
  },
});
