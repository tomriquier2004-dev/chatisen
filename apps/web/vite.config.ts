import preact from "@preact/preset-vite";
import { defineConfig } from "vite";

// En développement, /api est relayé vers l'API locale : même origine pour le navigateur,
// comme derrière Caddy en déploiement (architecture § 8.1).
const apiTarget = process.env.VITE_API_PROXY_TARGET ?? "http://127.0.0.1:3000";

export default defineConfig({
  plugins: [preact()],
  server: {
    host: "127.0.0.1",
    port: 5173,
    strictPort: true,
    proxy: {
      "/api": apiTarget,
      // Socket.IO en WebSocket, relayé lui aussi vers l'API locale.
      "/socket.io": { target: apiTarget, ws: true },
    },
  },
});
