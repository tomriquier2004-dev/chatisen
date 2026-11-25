import { randomUUID } from "node:crypto";
import { expect, type Browser, type Page } from "@playwright/test";

export interface TestUser {
  username: string;
  displayName: string;
  password: string;
}

/** Compte jetable au nom unique (les scénarios partagent la même base). */
export function newUser(prefix: string): TestUser {
  const id = randomUUID().slice(0, 8);
  return { username: `${prefix}_${id}`, displayName: `${prefix[0]!.toUpperCase()}${prefix.slice(1)} ${id}`, password: `pw-${randomUUID()}` };
}

/** Ouvre un navigateur isolé (cookies et stockage propres), comme une seconde personne. */
export async function openBrowser(browser: Browser, permissions: string[] = []): Promise<Page> {
  const context = await browser.newContext({ permissions: permissions as ("microphone" | "camera")[] });
  return context.newPage();
}

export async function register(page: Page, user: TestUser): Promise<void> {
  await page.goto("/");
  await page.getByRole("tab", { name: "Inscription" }).click();
  await page.getByLabel("Nom d'utilisateur").fill(user.username);
  await page.getByLabel("Adresse e-mail").fill(`${user.username}@example.test`);
  await page.getByLabel("Nom affiché").fill(user.displayName);
  await page.getByLabel("Mot de passe").fill(user.password);
  await page.getByRole("button", { name: "Créer mon compte" }).click();
  await expect(page.getByRole("button", { name: "+ Créer une conversation" })).toBeVisible();
}

export async function login(page: Page, user: TestUser): Promise<void> {
  await page.goto("/");
  await page.getByLabel("Nom d'utilisateur").fill(user.username);
  await page.getByLabel("Mot de passe").fill(user.password);
  await page.getByRole("button", { name: "Se connecter" }).click();
  await expect(page.getByRole("button", { name: "+ Créer une conversation" })).toBeVisible();
}

export async function logout(page: Page): Promise<void> {
  await page.getByRole("button", { name: "Se déconnecter" }).click();
  await expect(page.getByRole("button", { name: "Se connecter" })).toBeVisible();
}

async function pickUser(page: Page, user: TestUser): Promise<void> {
  const dialog = page.getByRole("dialog");
  await dialog.getByPlaceholder("Nom ou nom d'utilisateur (2 caractères min.)").fill(user.username);
  // La sidebar peut déjà contenir un bouton portant le même nom : scope le résultat à la modale.
  await dialog.getByRole("button").filter({ hasText: user.displayName }).click();
}

export async function createPrivate(page: Page, other: TestUser): Promise<void> {
  await page.getByRole("button", { name: "+ Créer une conversation" }).click();
  await pickUser(page, other);
  await expect(page.getByRole("heading", { level: 2, name: other.displayName })).toBeVisible();
}

export async function createGroup(page: Page, title: string, members: TestUser[]): Promise<void> {
  await page.getByRole("button", { name: "+ Créer une conversation" }).click();
  await page.getByRole("radio", { name: "Groupe" }).click();
  await page.getByLabel("Nom du groupe").fill(title);
  for (const m of members) await pickUser(page, m);
  await page.getByRole("button", { name: "Créer le groupe" }).click();
  await expect(page.getByRole("heading", { level: 2, name: title })).toBeVisible();
}

/** Ouvre une conversation depuis la sidebar (elle doit y apparaître, en direct si besoin). */
export async function openConversation(page: Page, title: string): Promise<void> {
  await conversationButton(page, title).click();
  await expect(page.getByRole("heading", { level: 2, name: title })).toBeVisible();
}

export async function sendMessage(page: Page, text: string): Promise<void> {
  await page.getByLabel("Votre message").fill(text);
  await page.getByLabel("Votre message").press("Enter");
}

/** Textes des messages affichés, dans l'ordre de la liste. */
export async function messageTexts(page: Page): Promise<string[]> {
  return page.locator("ol li p").allTextContents();
}

/** Entrée de la sidebar pour une conversation (filtre texte, sans expression régulière construite). */
export function conversationButton(page: Page, title: string) {
  return page.getByRole("navigation").getByRole("button").filter({ hasText: title });
}

/**
 * Coupure réseau contrôlée du temps réel : toutes les connexions WebSocket de la page passent par
 * un relais Playwright. `cut()` ferme les connexions et refuse les reconnexions ; `restore()` les
 * autorise de nouveau. Plus fiable que le mode hors ligne de Chromium, qui ne ferme pas toujours
 * une WebSocket déjà ouverte.
 */
export async function cuttableRealtime(page: Page) {
  let blocked = false;
  const open: Array<{ close(): Promise<void> }> = [];
  await page.routeWebSocket(/\/socket\.io\//, (ws) => {
    if (blocked) {
      void ws.close();
      return;
    }
    const server = ws.connectToServer();
    open.push(ws, server);
  });
  return {
    async cut() {
      blocked = true;
      await Promise.all(open.splice(0).map((c) => c.close().catch(() => undefined)));
    },
    restore() {
      blocked = false;
    },
  };
}
