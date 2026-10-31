import { defineConfig, devices } from "@playwright/test";

// E2E_PORT lets a local run use its own dev server instead of an already
// running stack on 5173 (the owner's dev server may serve another worktree).
// CI leaves it unset and starts a clean server on 5173.
const PORT = Number(process.env.E2E_PORT || 5173);
const BASE_URL = process.env.E2E_BASE_URL || `http://localhost:${PORT}`;

/**
 * See https://playwright.dev/docs/test-configuration.
 */
export default defineConfig({
  testDir: "./tests/e2e",
  /* Run tests in files in parallel */
  fullyParallel: true,
  /* Fail the build on CI if you accidentally left test.only in the source code. */
  forbidOnly: !!process.env.CI,
  /* Retry on CI only */
  retries: process.env.CI ? 2 : 0,
  /* Opt out of parallel tests on CI. */
  workers: process.env.CI ? 1 : undefined,
  /* Reporter to use. See https://playwright.dev/docs/test-reporters */
  reporter: "html",
  /* Shared settings for all the projects below. See https://playwright.dev/docs/api/class-testoptions. */
  use: {
    /* Base URL to use in actions like `await page.goto('/')`. */
    baseURL: BASE_URL,
    /* Collect trace when retrying the failed test. See https://playwright.dev/docs/trace-viewer */
    trace: "on-first-retry",
    /* Screenshot on failure */
    screenshot: "only-on-failure",
  },

  /* Configure projects for major browsers */
  projects: [
    {
      name: "chromium",
      use: { ...devices["Desktop Chrome"] },
      // The phone suite is a real 390x844 touch viewport and the accessibility
      // suite drives its own viewports/themes; both run as their own projects.
      testIgnore: ["**/phone/**", "**/a11y/**"],
    },
    {
      // CLV-65: axe audits at phone and kiosk sizes, light and dark. The specs
      // set viewport/colorScheme themselves per describe block.
      name: "a11y",
      testDir: "./tests/e2e/a11y",
      use: { ...devices["Desktop Chrome"] },
    },
    {
      name: "phone",
      testDir: "./tests/e2e/phone",
      use: {
        ...devices["Desktop Chrome"],
        viewport: { width: 390, height: 844 },
        deviceScaleFactor: 2,
        hasTouch: true,
        isMobile: true,
        // A phone has overlay scrollbars: without this, headless Chromium
        // reserves a desktop scrollbar and reports innerWidth 429 for a 390px
        // screen, hiding up to 39px of horizontal overflow.
        launchOptions: { args: ["--hide-scrollbars"] },
      },
    },
  ],

  /* Run your local dev server before starting the tests */
  webServer: {
    command: `npm run dev -- --port ${PORT} --strictPort`,
    url: BASE_URL,
    reuseExistingServer: !process.env.CI,
    timeout: 120 * 1000,
  },
});
