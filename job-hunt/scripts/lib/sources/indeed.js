import { chromium } from "playwright";

let browser = null;

async function getBrowser() {
  if (!browser) {
    browser = await chromium.launch({
      headless: true,
      args: ["--disable-blink-features=AutomationControlled", "--no-sandbox"],
    });
  }
  return browser;
}

export async function closeBrowser() {
  if (browser) {
    await browser.close();
    browser = null;
  }
}

export async function searchIndeed({ term, location }) {
  const b = await getBrowser();
  const context = await b.newContext({
    userAgent:
      "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/125.0.0.0 Safari/537.36",
    viewport: { width: 1440, height: 900 },
    locale: "en-GB",
  });

  const page = await context.newPage();
  await page.addInitScript(() => {
    Object.defineProperty(navigator, "webdriver", { get: () => false });
  });

  const url = `https://uk.indeed.com/jobs?q=${encodeURIComponent(term)}&l=${encodeURIComponent(location)}&sort=date`;

  try {
    await page.goto(url, { waitUntil: "domcontentloaded", timeout: 30000 });
    await page.waitForTimeout(2000);

    const pageTitle = await page.title();
    if (pageTitle.includes("Blocked") || pageTitle.includes("captcha")) {
      console.log(`[indeed] BLOCKED for "${term}"`);
      return [];
    }

    const jobs = await page.evaluate((defaultLocation) => {
      const results = [];
      const cards = document.querySelectorAll("a[data-jk]");

      for (const card of cards) {
        const title = card.querySelector("span")?.textContent?.trim()
          || card.textContent?.trim();
        if (!title || title.length < 3 || title.length > 200) continue;

        const jk = card.getAttribute("data-jk") || "";
        const href = card.href || "";

        const td = card.closest("td");
        if (!td) continue;

        const companyEl = td.querySelector("[data-testid='company-name']");
        const company = companyEl?.textContent?.trim() || "";

        const locEl = td.querySelector("[data-testid='text-location']");
        const location = locEl?.textContent?.trim() || defaultLocation;

        const salaryEl = td.querySelector(".metadata.salary-snippet-container, [data-testid='attribute_snippet_testid']");
        let snippet = salaryEl?.textContent?.trim() || "";

        // Also collect any other metadata snippets (employment type, etc.)
        const metadataEls = td.querySelectorAll("[data-testid='attribute_snippet_testid']");
        const metadata = [...metadataEls].map(el => el.textContent.trim()).join(" · ");
        if (metadata && !snippet.includes(metadata)) {
          snippet = snippet ? `${snippet} · ${metadata}` : metadata;
        }

        results.push({
          title,
          company: company || "(unknown)",
          location: location || defaultLocation,
          snippet,
          sourceId: jk,
          url: href,
        });
      }
      return results;
    }, location);

    // Take top 15 per search term
    return jobs.slice(0, 15);
  } catch (err) {
    console.error(`[indeed] Error searching "${term}":`, err.message);
    return [];
  } finally {
    await context.close();
  }
}
