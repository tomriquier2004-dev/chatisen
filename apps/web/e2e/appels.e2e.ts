import { expect, test } from "@playwright/test";
import { createGroup, createPrivate, newUser, openBrowser, openConversation, register } from "./helpers";

test("appel vocal à deux navigateurs : acceptation, état connecté et raccrochage", async ({ browser }) => {
  const [pageA, pageB] = await Promise.all([
    openBrowser(browser, ["microphone", "camera"]),
    openBrowser(browser, ["microphone", "camera"]),
  ]);
  const alice = newUser("alice");
  const bob = newUser("bob");
  await register(pageA, alice);
  await register(pageB, bob);
  await createPrivate(pageA, bob);
  await openConversation(pageB, alice.displayName);

  await pageA.getByRole("button", { name: "Appel vocal" }).click();
  const incoming = pageB.getByRole("dialog");
  await expect(incoming).toContainText("Appel entrant");
  await expect(incoming).toContainText(alice.displayName);
  await expect(incoming).toContainText("Appel vocal");
  await incoming.getByRole("button", { name: "Accepter" }).click();

  await expect(pageA.getByRole("dialog")).toContainText("Appel en cours", { timeout: 15_000 });
  await expect(pageB.getByRole("dialog")).toContainText("Appel en cours", { timeout: 15_000 });
  await pageA.getByRole("button", { name: "Raccrocher" }).click();
  await expect(pageA.getByRole("dialog")).toContainText("Appel terminé");
  await expect(pageB.getByRole("dialog")).toContainText("Appel terminé");
});

test("appel vidéo : image distante reçue et caméra coupée visible des deux côtés", async ({ browser }, testInfo) => {
  const [pageA, pageB] = await Promise.all([
    openBrowser(browser, ["microphone", "camera"]),
    openBrowser(browser, ["microphone", "camera"]),
  ]);
  const alice = newUser("alice");
  const bob = newUser("bob");
  await register(pageA, alice);
  await register(pageB, bob);
  await createPrivate(pageA, bob);
  await openConversation(pageB, alice.displayName);

  await pageA.getByRole("button", { name: "Appel vidéo" }).click();
  const incoming = pageB.getByRole("dialog");
  await expect(incoming).toContainText("Appel vidéo");
  await incoming.getByRole("button", { name: "Accepter" }).click();
  await expect(pageA.getByRole("dialog")).toContainText("Appel en cours", { timeout: 15_000 });
  await expect(pageB.getByRole("dialog")).toContainText("Appel en cours", { timeout: 15_000 });

  const remoteVideo = pageB.getByLabel("Vidéo de votre correspondant");
  await expect.poll(() => remoteVideo.evaluate((node) => (node as HTMLVideoElement).videoWidth), { timeout: 15_000 }).toBeGreaterThan(0);

  // Captures de la scène d'appel dans les deux thèmes pour la relecture UI de la PR.
  await pageA.screenshot({ path: testInfo.outputPath("call-light.png") });
  await pageA.locator("html").evaluate((element) => element.setAttribute("data-theme", "dark"));
  await pageA.screenshot({ path: testInfo.outputPath("call-dark.png") });

  await pageA.getByRole("button", { name: "Couper la caméra" }).click();
  await expect(pageB.getByText(/Caméra de .* coupée/)).toBeVisible();
  await expect(pageA.getByText("Votre caméra est coupée")).toBeVisible();
  await pageA.getByRole("button", { name: "Rétablir la caméra" }).click();
  await expect.poll(() => remoteVideo.evaluate((node) => (node as HTMLVideoElement).videoWidth), { timeout: 10_000 }).toBeGreaterThan(0);

  await pageA.getByRole("button", { name: "Raccrocher" }).click();
  await expect(pageB.getByRole("dialog")).toContainText("Appel terminé");
});

test("refus, absence de réponse et conversation de groupe sans action d'appel", async ({ browser }) => {
  const [pageA, pageB] = await Promise.all([
    openBrowser(browser, ["microphone"]),
    openBrowser(browser, ["microphone"]),
  ]);
  const alice = newUser("alice");
  const bob = newUser("bob");
  await register(pageA, alice);
  await register(pageB, bob);
  await createPrivate(pageA, bob);
  await openConversation(pageB, alice.displayName);

  await pageA.getByRole("button", { name: "Appel vocal" }).click();
  const incoming = pageB.getByRole("dialog");
  await expect(incoming).toContainText("Appel entrant");
  await incoming.getByRole("button", { name: "Refuser" }).click();
  await expect(pageA.getByRole("dialog")).toContainText("Appel refusé.");

  // Ferme le résultat du premier appel, puis laisse expirer le délai de sonnerie (5 s en E2E).
  await pageA.getByRole("button", { name: "Fermer" }).click();
  await pageB.getByRole("button", { name: "Fermer" }).click();
  await pageA.getByRole("button", { name: "Appel vocal" }).click();
  await expect(pageB.getByRole("dialog")).toContainText("Appel entrant");
  await expect(pageA.getByRole("dialog")).toContainText("Sans réponse.", { timeout: 10_000 });

  await pageA.getByRole("button", { name: "Fermer" }).click();
  await pageB.getByRole("button", { name: "Fermer" }).click();
  await createGroup(pageA, "Groupe sans appels", [bob]);
  await expect(pageA.getByRole("button", { name: "Appel vocal" })).toHaveCount(0);
  await expect(pageA.getByRole("button", { name: "Appel vidéo" })).toHaveCount(0);
});
