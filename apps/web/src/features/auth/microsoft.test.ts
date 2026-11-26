import { describe, expect, it } from "vitest";
import { MICROSOFT_LOGIN_ERRORS } from "@chatisen/shared";
import { microsoftErrorMessage } from "./microsoft";

describe("microsoftErrorMessage", () => {
  it("donne un message pour chaque code renvoyé par le serveur", () => {
    for (const code of MICROSOFT_LOGIN_ERRORS) {
      expect(microsoftErrorMessage(`?authError=${code}`)).toEqual(expect.any(String));
    }
  });

  it("ignore un paramètre absent ou inconnu (pas de texte choisi par l'adresse)", () => {
    expect(microsoftErrorMessage("")).toBeNull();
    expect(microsoftErrorMessage("?authError=<script>")).toBeNull();
  });
});
