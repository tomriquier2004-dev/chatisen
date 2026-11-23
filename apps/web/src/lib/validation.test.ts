import { describe, expect, it } from "vitest";
import { RegisterRequest } from "@chatisen/shared";
import { fieldErrors } from "./validation";

const messages = {
  username: "nom invalide",
  email: "adresse invalide",
  password: "mot de passe trop court",
  displayName: "nom affiché invalide",
};

describe("fieldErrors", () => {
  it("ne renvoie rien pour un formulaire valide", () => {
    expect(
      fieldErrors(
        RegisterRequest,
        { username: "alice_1", email: "alice@example.test", password: "correct horse", displayName: "Alice" },
        messages,
      ),
    ).toEqual({});
  });

  it("renvoie un message par champ fautif, selon le schéma partagé avec l'API", () => {
    expect(
      fieldErrors(RegisterRequest, { username: "a b", email: "nope", password: "court", displayName: "" }, messages),
    ).toEqual(messages);
  });

  it("n'indique que les champs en erreur", () => {
    expect(
      fieldErrors(
        RegisterRequest,
        { username: "alice", email: "alice@example.test", password: "court", displayName: "Alice" },
        messages,
      ),
    ).toEqual({ password: "mot de passe trop court" });
  });
});
