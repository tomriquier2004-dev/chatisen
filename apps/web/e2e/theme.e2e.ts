import { expect, test } from "@playwright/test";
import { openBrowser } from "./helpers";

/** Choix du thème (design system § 2.4) : suit le système par défaut, un thème forcé est mémorisé. */
test("le thème suit le système, puis un choix forcé survit au rechargement", async ({ browser }) => {
  const page = await openBrowser(browser);
  const html = page.locator("html");
  await page.emulateMedia({ colorScheme: "dark" });
  await page.goto("/");
  await expect(html).toHaveAttribute("data-theme", "dark");
  await page.emulateMedia({ colorScheme: "light" });
  await expect(html).toHaveAttribute("data-theme", "light");

  await page.getByRole("radio", { name: "Sombre" }).click();
  await expect(page.getByRole("radio", { name: "Sombre" })).toHaveAttribute("aria-checked", "true");
  await page.reload();
  await expect(html).toHaveAttribute("data-theme", "dark");

  await page.getByRole("radio", { name: "Système" }).click();
  await expect(html).toHaveAttribute("data-theme", "light");
  await page.reload();
  await expect(html).toHaveAttribute("data-theme", "light");
});
