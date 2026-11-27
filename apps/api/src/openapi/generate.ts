/**
 * Génère les spécifications OpenAPI 3.0 de l'API (une par module, plus une spécification complète)
 * à partir des schémas TypeBox des routes réellement enregistrées. Aucune dépendance de plus : les
 * routes sont relevées par le hook `onRoute` de Fastify, les schémas TypeBox étant déjà du JSON Schema.
 *
 * Usage : pnpm --filter @chatisen/api openapi   (écrit dans docs/api/openapi/, voir docs/architecture.md § 7).
 */
import { randomBytes } from "node:crypto";
import dc from "node:diagnostics_channel";
import { mkdirSync, writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { ErrorResponse } from "@chatisen/shared";
import { buildApp } from "../app";
import { loadConfig } from "../config";
import { createDb } from "../db";

type Json = Record<string, unknown>;
interface RouteOptions {
  method: string | string[];
  url: string;
  prefix?: string;
  schema?: { params?: Json; querystring?: Json; body?: Json; response?: Record<string, Json> };
}

const MODULES = ["auth", "users", "conversations", "messages", "calls", "turn", "plateforme"] as const;
type Module = (typeof MODULES)[number];

const MODULE_TITLES: Record<Module, string> = {
  auth: "Authentification et sessions (mot de passe, refresh rotatif, connexion Microsoft)",
  users: "Utilisateurs (profil, recherche)",
  conversations: "Conversations privées et de groupe, membres et rôles",
  messages: "Messages (historique paginé ; l'envoi se fait par Socket.IO)",
  calls: "Appels (mesures de qualité ; la signalisation se fait par Socket.IO)",
  turn: "Identifiants TURN éphémères",
  plateforme: "Sondes de santé",
};

/** Résumé et exigences par route (architecture § 5.1). Le module se déduit du chemin. */
const DOC: Record<string, { summary: string; fr?: string[]; public?: boolean; module?: Module }> = {
  "POST /auth/register": { summary: "Inscription", fr: ["FR-01", "FR-02"], public: true },
  "POST /auth/login": { summary: "Connexion : access token et cookie de refresh", fr: ["FR-01", "FR-04"], public: true },
  "POST /auth/refresh": { summary: "Rotation du refresh token (cookie)", fr: ["FR-04"], public: true },
  "POST /auth/logout": { summary: "Révocation de la session (cookie)", fr: ["FR-04"], public: true },
  "GET /auth/providers": { summary: "Fournisseurs de connexion activés", fr: ["FR-01"], public: true },
  "GET /auth/microsoft/start": { summary: "Redirection vers Microsoft (PKCE, state, nonce)", fr: ["FR-01"], public: true },
  "GET /auth/microsoft/callback": { summary: "Retour de Microsoft, ouverture de la session", fr: ["FR-01", "FR-04"], public: true },
  "GET /users/me": { summary: "Profil de l'utilisateur courant", fr: ["FR-02"] },
  "GET /users": { summary: "Recherche d'utilisateurs", fr: ["FR-02"], module: "users" },
  "GET /conversations": { summary: "Conversations de l'utilisateur, avec les non-lus", fr: ["FR-06"] },
  "POST /conversations": { summary: "Créer une conversation privée ou de groupe", fr: ["FR-06", "FR-16"] },
  "GET /conversations/{id}": { summary: "Détail d'une conversation", fr: ["FR-06"] },
  "POST /conversations/{id}/members": { summary: "Ajouter un membre", fr: ["FR-03", "FR-16"] },
  "PATCH /conversations/{id}/members/{userId}": { summary: "Changer le rôle d'un membre", fr: ["FR-16"] },
  "DELETE /conversations/{id}/members/{userId}": { summary: "Retirer un membre ou quitter", fr: ["FR-03", "FR-16"] },
  "GET /conversations/{id}/messages": { summary: "Historique paginé", fr: ["FR-08"], module: "messages" },
  "GET /turn/credentials": { summary: "Identifiants TURN éphémères", fr: ["FR-09", "FR-10"] },
  "POST /calls/{id}/quality": { summary: "Envoi groupé de mesures de qualité par un participant actif", fr: ["FR-13", "NFR-04"] },
  "GET /health/live": { summary: "Sonde de vie", fr: ["NFR-03"], public: true },
  "GET /health/ready": { summary: "Sonde de disponibilité (PostgreSQL et Redis)", fr: ["NFR-03", "NFR-06"], public: true },
};

/** Réponses que les schémas Fastify ne décrivent pas (pas de `response` déclaré). */
const EXTRA_RESPONSES: Record<string, Record<string, Json>> = {
  "POST /auth/logout": { "204": { description: "Session révoquée, cookie effacé" } },
  "GET /auth/microsoft/start": { "302": { description: "Redirection vers la page de connexion Microsoft" } },
  "GET /auth/microsoft/callback": {
    "303": { description: "Redirection vers l'application (session ouverte, ou ?authError=<code>)" },
  },
  "DELETE /conversations/{id}/members/{userId}": { "204": { description: "Membre retiré" } },
};

const COMMON_ERRORS: Json = {
  description: "Erreur au format unique (FR-18)",
  content: { "application/json": { schema: { $ref: "#/components/schemas/ErrorResponse" } } },
};

function moduleOf(path: string, doc?: { module?: Module }): Module {
  if (doc?.module) return doc.module;
  const first = path.split("/")[1] ?? "";
  return (MODULES as readonly string[]).includes(first) ? (first as Module) : first === "health" ? "plateforme" : "plateforme";
}

const components: Record<string, Json> = {};

/** JSON Schema (TypeBox) -> schéma OpenAPI 3.0 : `const` devient `enum`, `null` devient `nullable`, `$id` devient un composant. */
function toOas(input: unknown, isRoot = false): Json {
  if (Array.isArray(input)) return input.map((item) => toOas(item)) as unknown as Json;
  if (input === null || typeof input !== "object") return input as unknown as Json;
  const src = { ...(input as Json) };
  const id = src.$id as string | undefined;
  delete src.$id;
  delete src.$schema;
  if (typeof src.$ref === "string") src.$ref = `#/components/schemas/${src.$ref.replace(/#$/, "")}`;
  if ("const" in src) {
    src.enum = [src.const];
    if (!src.type) src.type = typeof src.const;
    delete src.const;
  }
  for (const key of ["properties"] as const) {
    if (src[key]) {
      src[key] = Object.fromEntries(Object.entries(src[key] as Json).map(([k, v]) => [k, toOas(v)]));
    }
  }
  for (const key of ["items", "additionalProperties"] as const) {
    if (src[key] && typeof src[key] === "object") src[key] = toOas(src[key]);
  }
  for (const key of ["anyOf", "oneOf", "allOf"] as const) {
    if (!Array.isArray(src[key])) continue;
    let members = (src[key] as Json[]).map((m) => toOas(m));
    const hasNull = members.some((m) => m.type === "null");
    members = members.filter((m) => m.type !== "null");
    const allLiteral = members.length > 0 && members.every((m) => Array.isArray(m.enum) && Object.keys(m).length <= 2);
    if (allLiteral) {
      delete src[key];
      src.enum = members.flatMap((m) => m.enum as unknown[]);
      src.type = members[0]?.type;
    } else if (members.length === 1 && key === "anyOf") {
      delete src[key];
      Object.assign(src, members[0]);
    } else {
      src[key] = members;
    }
    if (hasNull) src.nullable = true;
  }
  if (src.type === "null") return { nullable: true };
  if (id && !isRoot) {
    if (!components[id]) components[id] = src;
    return { $ref: `#/components/schemas/${id}` };
  }
  return src;
}

function parametersOf(schema: Json | undefined, where: "path" | "query"): Json[] {
  if (!schema) return [];
  const converted = toOas(schema, true);
  const required = new Set((converted.required as string[] | undefined) ?? []);
  return Object.entries((converted.properties as Json | undefined) ?? {}).map(([name, s]) => ({
    name,
    in: where,
    required: where === "path" ? true : required.has(name),
    schema: s,
  }));
}

function main(): void {
  const here = dirname(fileURLToPath(import.meta.url));
  const out = resolve(here, "../../../../docs/api/openapi");
  const routes: RouteOptions[] = [];
  components.ErrorResponse = toOas(ErrorResponse, true);
  dc.subscribe("fastify.initialization", (message) => {
    const { fastify } = message as { fastify: { addHook: (n: string, fn: (r: RouteOptions) => void) => void } };
    fastify.addHook("onRoute", (r) => routes.push(r));
  });

  const config = loadConfig({
    NODE_ENV: "test",
    LOG_LEVEL: "silent",
    JWT_SECRET: randomBytes(48).toString("base64"),
    RATE_LIMIT_ENABLED: "false",
    // Valeurs factices : elles servent seulement à enregistrer les routes de la connexion Microsoft.
    MICROSOFT_CLIENT_ID: "openapi-generation",
    MICROSOFT_CLIENT_SECRET: "openapi-generation",
    MICROSOFT_REDIRECT_URI: "http://localhost/api/v1/auth/microsoft/callback",
  });
  // Aucune connexion n'est ouverte : le pool PostgreSQL est paresseux et aucune route n'est appelée.
  const db = createDb("postgres://openapi:openapi@127.0.0.1:1/openapi", 1);
  const app = buildApp(config, { db });

  void app.ready().then(async () => {
    await app.close();
    await db.destroy();

    const perModule = new Map<Module, Json>();
    for (const route of routes) {
      const methods = (Array.isArray(route.method) ? route.method : [route.method]).filter((m) => m !== "HEAD" && m !== "OPTIONS");
      const prefix = route.prefix ?? "";
      const fullPath = (route.url.startsWith(prefix) ? route.url : prefix + route.url).replace(/\/{2,}/g, "/");
      if (!fullPath.startsWith("/api/v1/")) continue; // /metrics : réseau interne, hors spécification
      const path = fullPath.slice("/api/v1".length).replace(/:([A-Za-z]+)/g, "{$1}");
      for (const method of methods) {
        const key = `${method} ${path}`;
        const doc = DOC[key];
        if (!doc) throw new Error(`Route sans description dans DOC : ${key}`);
        const module = moduleOf(path, doc);
        const schema = route.schema ?? {};
        const responses: Record<string, Json> = {};
        for (const [code, s] of Object.entries(schema.response ?? {})) {
          responses[code] = {
            description: code.startsWith("2") ? "Succès" : "Réponse",
            content: { "application/json": { schema: toOas(s) } },
          };
        }
        Object.assign(responses, EXTRA_RESPONSES[key] ?? {});
        responses["4XX"] = COMMON_ERRORS;
        responses["5XX"] = COMMON_ERRORS;
        const parameters = [...parametersOf(schema.params, "path"), ...parametersOf(schema.querystring, "query")];
        const operation: Json = {
          operationId: `${method.toLowerCase()}_${path.replace(/[{}]/g, "").replace(/\W+/g, "_").replace(/^_|_$/g, "")}`,
          summary: doc.summary,
          tags: [module],
          ...(doc.fr ? { "x-requirements": doc.fr } : {}),
          ...(parameters.length ? { parameters } : {}),
          ...(schema.body
            ? { requestBody: { required: true, content: { "application/json": { schema: toOas(schema.body) } } } }
            : {}),
          responses,
          ...(doc.public ? { security: [] } : {}),
        };
        const paths = ((perModule.get(module) ?? {}) as Json);
        const item = ((paths[path] ?? {}) as Json);
        item[method.toLowerCase()] = operation;
        paths[path] = item;
        perModule.set(module, paths);
      }
    }

    /** Composants réellement référencés par ces chemins (et, de proche en proche, par les composants eux-mêmes). */
    const usedComponents = (paths: Json): Json => {
      const used = new Set<string>();
      const visit = (value: unknown): void => {
        for (const [, name] of JSON.stringify(value).matchAll(/#\/components\/schemas\/([A-Za-z0-9_]+)/g)) {
          if (name && !used.has(name)) {
            used.add(name);
            visit(components[name]);
          }
        }
      };
      visit(paths);
      return Object.fromEntries([...used].sort().map((name) => [name, components[name] as Json]));
    };
    const base = (title: string, paths: Json): Json => ({
      openapi: "3.0.3",
      info: {
        title,
        version: "0.0.0",
        description:
          "Spécification générée à partir des schémas TypeBox des routes (apps/api/src/openapi/generate.ts). " +
          "Les événements Socket.IO ne sont pas décrits ici (docs/architecture.md § 5.2).",
      },
      servers: [{ url: "/api/v1" }],
      security: [{ bearerAuth: [] }],
      paths,
      components: {
        securitySchemes: { bearerAuth: { type: "http", scheme: "bearer", bearerFormat: "JWT" } },
        schemas: usedComponents(paths),
      },
    });
    const stable = (v: unknown): unknown =>
      Array.isArray(v) ? v.map(stable)
        : v && typeof v === "object"
          ? Object.fromEntries(Object.entries(v as Json).sort(([a], [b]) => a.localeCompare(b)).map(([k, x]) => [k, stable(x)]))
          : v;
    mkdirSync(out, { recursive: true });
    const all: Json = {};
    for (const module of MODULES) {
      const paths = perModule.get(module);
      if (!paths) continue;
      Object.assign(all, paths);
      writeFileSync(resolve(out, `${module}.json`), JSON.stringify(stable(base(`ChatISEN API : module ${module}. ${MODULE_TITLES[module]}`, paths)), null, 2) + "\n");
    }
    writeFileSync(resolve(out, "openapi.json"), JSON.stringify(stable(base("ChatISEN API (spécification complète)", all)), null, 2) + "\n");
    console.log(`OpenAPI écrite dans ${out} : ${[...perModule.keys()].join(", ")}`);
  });
}

main();
