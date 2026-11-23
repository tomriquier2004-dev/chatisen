import { expect, test } from "@playwright/test";
import {
  createGroup,
  createPrivate,
  cuttableRealtime,
  login,
  logout,
  messageTexts,
  newUser,
  openBrowser,
  openConversation,
  register,
  sendMessage,
} from "./helpers";

/**
 * Parcours de la messagerie dans de vrais navigateurs (issue #81, FR-01, FR-05, FR-17, NFR-03).
 * Chaque personne a son propre contexte Chromium (cookies, stockage et socket séparés).
 */

test("inscription, déconnexion puis reconnexion", async ({ browser }) => {
  const page = await openBrowser(browser);
  const alice = newUser("alice");
  await register(page, alice);
  await logout(page);
  await login(page, alice);
  // La session survit à un rechargement (cookie de refresh httpOnly).
  await page.reload();
  await expect(page.getByRole("button", { name: "+ Créer une conversation" })).toBeVisible();
  await logout(page);
});

test("un message envoyé dans un navigateur est reçu en direct dans l'autre", async ({ browser }) => {
  const [pageA, pageB] = await Promise.all([openBrowser(browser), openBrowser(browser)]);
  const alice = newUser("alice");
  const bob = newUser("bob");
  await register(pageA, alice);
  await register(pageB, bob);

  await createPrivate(pageA, bob);
  // La conversation apparaît chez Bob sans rechargement (conversation:member-added).
  await openConversation(pageB, alice.displayName);

  await sendMessage(pageA, "Bonjour Bob !");
  await expect(pageB.locator("ol li p", { hasText: "Bonjour Bob !" })).toBeVisible();
  await sendMessage(pageB, "Salut Alice");
  await expect(pageA.locator("ol li p", { hasText: "Salut Alice" })).toBeVisible();
});

test("après une coupure réseau, les messages manqués arrivent dans l'ordre, sans doublon", async ({ browser }) => {
  const [pageA, pageB] = await Promise.all([openBrowser(browser), openBrowser(browser)]);
  const alice = newUser("alice");
  const bob = newUser("bob");
  const network = await cuttableRealtime(pageB);
  await register(pageA, alice);
  await register(pageB, bob);
  await createPrivate(pageA, bob);
  await openConversation(pageB, alice.displayName);
  await sendMessage(pageA, "avant la coupure");
  await expect(pageB.locator("ol li p", { hasText: "avant la coupure" })).toBeVisible();

  // Coupure du temps réel de Bob : sa socket est fermée et les reconnexions échouent.
  await network.cut();
  await expect(pageB.getByRole("status").filter({ hasText: /Connexion perdue|Hors ligne/ })).toBeVisible();

  for (const n of [1, 2, 3]) await sendMessage(pageA, `pendant la coupure ${n}`);
  await expect(pageA.locator("ol li p", { hasText: "pendant la coupure 3" })).toBeVisible();

  network.restore();
  await expect(pageB.locator("ol li p", { hasText: "pendant la coupure 3" })).toBeVisible({ timeout: 20_000 });
  const texts = await messageTexts(pageB);
  expect(texts).toEqual(["avant la coupure", "pendant la coupure 1", "pendant la coupure 2", "pendant la coupure 3"]);
});

test("un membre retiré cesse de recevoir les messages, sans recharger la page", async ({ browser }) => {
  const [pageA, pageB] = await Promise.all([openBrowser(browser), openBrowser(browser)]);
  const owner = newUser("owner");
  const bob = newUser("bob");
  const title = `Groupe ${bob.username}`;
  await register(pageA, owner);
  await register(pageB, bob);
  await createGroup(pageA, title, [bob]);
  await openConversation(pageB, title);

  await sendMessage(pageA, "message pour tous");
  await expect(pageB.locator("ol li p", { hasText: "message pour tous" })).toBeVisible();

  // Le propriétaire retire Bob depuis la gestion des membres.
  await pageA.getByRole("button", { name: "Membres" }).click();
  const bobRow = pageA.getByRole("listitem").filter({ hasText: bob.displayName });
  await bobRow.getByRole("button", { name: "Retirer" }).click();
  await expect(pageA.getByRole("dialog").getByText(bob.displayName)).toHaveCount(0);
  await pageA.keyboard.press("Escape");

  // Chez Bob : la vue se ferme et la conversation disparaît de la liste, sans rechargement.
  await expect(pageB.getByText(`Vous avez été retiré de « ${title} ».`)).toBeVisible();
  await expect(pageB.getByRole("navigation").getByRole("button", { name: new RegExp(title) })).toHaveCount(0);

  // Un message envoyé ensuite ne lui parvient pas.
  await sendMessage(pageA, "message après le retrait");
  await expect(pageA.locator("ol li p", { hasText: "message après le retrait" })).toBeVisible();
  await pageB.waitForTimeout(1000);
  await expect(pageB.getByText("message après le retrait")).toHaveCount(0);
});
