# Instructions

- Following Playwright test failed.
- Explain why, be concise, respect Playwright best practices.
- Provide a snippet of code with the fix, if possible.

# Test info

- Name: messagerie.e2e.ts >> après une coupure, la liste des conversations est rechargée (nouvelle conversation, aperçu, non-lus)
- Location: e2e\messagerie.e2e.ts:107:1

# Error details

```
Error: expect(locator).toBeVisible() failed

Locator: getByRole('navigation').getByRole('button').filter({ hasText: 'Alice 2fc98a68' })
Expected: visible
Timeout: 20000ms
Error: element(s) not found

Call log:
  - Expect "toBeVisible" getByRole('navigation').getByRole('button').filter({ hasText: 'Alice 2fc98a68' }) with timeout 20000ms
  - waiting for getByRole('navigation').getByRole('button').filter({ hasText: 'Alice 2fc98a68' })

```

```yaml
- complementary "Conversations":
  - text: Bob 06cf3639
  - button "Se déconnecter"
  - button "+ Créer une conversation"
  - navigation "Privées":
    - heading "Privées" [level=2]
    - paragraph: Aucune conversation.
  - navigation "Groupes":
    - heading "Groupes" [level=2]
    - list:
      - listitem:
        - button "Groupe bob_06cf3639 Aucun message"
- main:
  - status: Connexion perdue. Reconnexion en cours…
  - paragraph: Sélectionnez ou créez une conversation.
```

# Test source

```ts
  33  | 
  34  | test("un message envoyé dans un navigateur est reçu en direct dans l'autre", async ({ browser }) => {
  35  |   const [pageA, pageB] = await Promise.all([openBrowser(browser), openBrowser(browser)]);
  36  |   const alice = newUser("alice");
  37  |   const bob = newUser("bob");
  38  |   await register(pageA, alice);
  39  |   await register(pageB, bob);
  40  | 
  41  |   await createPrivate(pageA, bob);
  42  |   // La conversation apparaît chez Bob sans rechargement (conversation:member-added).
  43  |   await openConversation(pageB, alice.displayName);
  44  | 
  45  |   await sendMessage(pageA, "Bonjour Bob !");
  46  |   await expect(pageB.locator("ol li p", { hasText: "Bonjour Bob !" })).toBeVisible();
  47  |   await sendMessage(pageB, "Salut Alice");
  48  |   await expect(pageA.locator("ol li p", { hasText: "Salut Alice" })).toBeVisible();
  49  | });
  50  | 
  51  | test("après une coupure réseau, les messages manqués arrivent dans l'ordre, sans doublon", async ({ browser }) => {
  52  |   const [pageA, pageB] = await Promise.all([openBrowser(browser), openBrowser(browser)]);
  53  |   const alice = newUser("alice");
  54  |   const bob = newUser("bob");
  55  |   const network = await cuttableRealtime(pageB);
  56  |   await register(pageA, alice);
  57  |   await register(pageB, bob);
  58  |   await createPrivate(pageA, bob);
  59  |   await openConversation(pageB, alice.displayName);
  60  |   await sendMessage(pageA, "avant la coupure");
  61  |   await expect(pageB.locator("ol li p", { hasText: "avant la coupure" })).toBeVisible();
  62  | 
  63  |   // Coupure du temps réel de Bob : sa socket est fermée et les reconnexions échouent.
  64  |   await network.cut();
  65  |   await expect(pageB.getByRole("status").filter({ hasText: /Connexion perdue|Hors ligne/ })).toBeVisible();
  66  | 
  67  |   for (const n of [1, 2, 3]) await sendMessage(pageA, `pendant la coupure ${n}`);
  68  |   await expect(pageA.locator("ol li p", { hasText: "pendant la coupure 3" })).toBeVisible();
  69  | 
  70  |   network.restore();
  71  |   await expect(pageB.locator("ol li p", { hasText: "pendant la coupure 3" })).toBeVisible({ timeout: 20_000 });
  72  |   const texts = await messageTexts(pageB);
  73  |   expect(texts).toEqual(["avant la coupure", "pendant la coupure 1", "pendant la coupure 2", "pendant la coupure 3"]);
  74  | });
  75  | 
  76  | test("un membre retiré cesse de recevoir les messages, sans recharger la page", async ({ browser }) => {
  77  |   const [pageA, pageB] = await Promise.all([openBrowser(browser), openBrowser(browser)]);
  78  |   const owner = newUser("owner");
  79  |   const bob = newUser("bob");
  80  |   const title = `Groupe ${bob.username}`;
  81  |   await register(pageA, owner);
  82  |   await register(pageB, bob);
  83  |   await createGroup(pageA, title, [bob]);
  84  |   await openConversation(pageB, title);
  85  | 
  86  |   await sendMessage(pageA, "message pour tous");
  87  |   await expect(pageB.locator("ol li p", { hasText: "message pour tous" })).toBeVisible();
  88  | 
  89  |   // Le propriétaire retire Bob depuis la gestion des membres.
  90  |   await pageA.getByRole("button", { name: "Membres" }).click();
  91  |   const bobRow = pageA.getByRole("listitem").filter({ hasText: bob.displayName });
  92  |   await bobRow.getByRole("button", { name: "Retirer" }).click();
  93  |   await expect(pageA.getByRole("dialog").getByText(bob.displayName)).toHaveCount(0);
  94  |   await pageA.keyboard.press("Escape");
  95  | 
  96  |   // Chez Bob : la vue se ferme et la conversation disparaît de la liste, sans rechargement.
  97  |   await expect(pageB.getByText(`Vous avez été retiré de « ${title} ».`)).toBeVisible();
  98  |   await expect(conversationButton(pageB, title)).toHaveCount(0);
  99  | 
  100 |   // Un message envoyé ensuite ne lui parvient pas.
  101 |   await sendMessage(pageA, "message après le retrait");
  102 |   await expect(pageA.locator("ol li p", { hasText: "message après le retrait" })).toBeVisible();
  103 |   await pageB.waitForTimeout(1000);
  104 |   await expect(pageB.getByText("message après le retrait")).toHaveCount(0);
  105 | });
  106 | 
  107 | test("après une coupure, la liste des conversations est rechargée (nouvelle conversation, aperçu, non-lus)", async ({
  108 |   browser,
  109 | }) => {
  110 |   const [pageA, pageB] = await Promise.all([openBrowser(browser), openBrowser(browser)]);
  111 |   const alice = newUser("alice");
  112 |   const bob = newUser("bob");
  113 |   const group = `Groupe ${bob.username}`;
  114 |   const network = await cuttableRealtime(pageB);
  115 |   await register(pageA, alice);
  116 |   await register(pageB, bob);
  117 |   await createGroup(pageA, group, [bob]);
  118 |   await expect(conversationButton(pageB, group)).toBeVisible();
  119 | 
  120 |   // Bob n'a aucune conversation ouverte : tout ce qui suit n'arrive que par la liste.
  121 |   await network.cut();
  122 |   await expect(pageB.getByRole("status").filter({ hasText: /Connexion perdue|Hors ligne/ })).toBeVisible();
  123 | 
  124 |   // Pendant la coupure : un message dans le groupe, et une nouvelle conversation privée avec Bob.
  125 |   await openConversation(pageA, group);
  126 |   await sendMessage(pageA, "message pendant la coupure");
  127 |   await expect(pageA.locator("ol li p", { hasText: "message pendant la coupure" })).toBeVisible();
  128 |   await createPrivate(pageA, bob);
  129 |   await expect(conversationButton(pageB, alice.displayName)).toHaveCount(0);
  130 | 
  131 |   network.restore();
  132 |   // Sans recharger la page : la conversation privée apparaît, l'aperçu et le non-lu du groupe sont à jour.
> 133 |   await expect(conversationButton(pageB, alice.displayName)).toBeVisible({ timeout: 20_000 });
      |                                                              ^ Error: expect(locator).toBeVisible() failed
  134 |   const groupEntry = conversationButton(pageB, group);
  135 |   await expect(groupEntry).toContainText("message pendant la coupure");
  136 |   await expect(groupEntry.getByLabel("1 non lus")).toBeVisible();
  137 | });
  138 | 
```