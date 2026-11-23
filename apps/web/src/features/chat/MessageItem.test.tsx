import { describe, expect, it } from "vitest";
import { render } from "preact-render-to-string";
import { MessageItem, initials } from "./MessageItem";

const sent = (body: string) => ({
  status: "sent" as const,
  message: {
    id: "id1",
    conversationId: "conv",
    senderId: "u1",
    seq: 1,
    clientMsgId: "c1",
    body,
    createdAt: new Date(0).toISOString(),
  },
});

describe("MessageItem", () => {
  it("affiche le HTML d'un message comme du texte, sans l'interpréter (XSS)", () => {
    const html = render(
      <MessageItem item={sent('<img src=x onerror="alert(1)"><script>alert(2)</script>')} authorName="Mallory" isMine={false} grouped={false} />,
    );
    expect(html).not.toContain("<img");
    expect(html).not.toContain("<script");
    expect(html).toContain("&lt;img src=x onerror=&quot;alert(1)&quot;>&lt;script>");
  });

  it("indique l'envoi en cours d'un message pas encore confirmé", () => {
    const html = render(
      <MessageItem item={{ status: "pending", clientMsgId: "c", body: "salut", senderId: "u1" }} authorName="Alice" isMine grouped={false} />,
    );
    expect(html).toContain("Envoi…");
    expect(html).toContain("Vous");
  });

  it("propose de réessayer un message en échec", () => {
    const html = render(
      <MessageItem
        item={{ status: "failed", clientMsgId: "c", body: "salut", senderId: "u1", error: "Hors ligne." }}
        authorName="Alice"
        isMine
        grouped
      />,
    );
    expect(html).toContain("Hors ligne.");
    expect(html).toContain("Réessayer");
  });

  it("calcule les initiales de l'avatar", () => {
    expect(initials("Alice Martin")).toBe("AM");
    expect(initials("bob")).toBe("B");
    expect(initials("  ")).toBe("?");
  });
});
