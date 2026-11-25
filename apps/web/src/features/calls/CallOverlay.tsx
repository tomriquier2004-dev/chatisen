import { useEffect, useRef, useState } from "preact/hooks";
import type { ConversationView } from "@chatisen/shared";
import { calls } from "../../app/services";
import type { CallState } from "./callState";
import styles from "./CallOverlay.module.css";

export interface CallOverlayProps {
  conversations: ConversationView[];
}

/** Overlay global : sonnerie entrante visible même si l'utilisateur consulte un autre écran. */
export function CallOverlay({ conversations }: CallOverlayProps) {
  const [state, setState] = useState<CallState>(calls.state);
  const acceptRef = useRef<HTMLButtonElement>(null);
  const localVideo = useRef<HTMLVideoElement>(null);
  const remoteVideo = useRef<HTMLVideoElement>(null);
  const remoteAudio = useRef<HTMLAudioElement>(null);
  const [elapsed, setElapsed] = useState(0);

  useEffect(() => calls.subscribe(setState), []);
  const localStream = calls.localStream;
  const remoteStream = calls.remoteStream;
  const localCameraEnabled = calls.cameraEnabled;
  const remoteCameraEnabled = calls.remoteCameraEnabled;
  const conversationId = "conversationId" in state ? state.conversationId : null;
  const conversation = conversations.find((item) => item.id === conversationId);
  const peerId = "peerId" in state ? state.peerId : null;
  const peerName = conversation?.members.find((member) => member.user.id === peerId)?.user.displayName ?? "Votre correspondant";
  const callId = "callId" in state ? state.callId : null;
  const media = "media" in state ? state.media : null;

  useEffect(() => {
    if (state.status === "incoming") acceptRef.current?.focus();
  }, [state.status, callId]);

  useEffect(() => {
    if (localVideo.current) localVideo.current.srcObject = localStream;
    if (remoteVideo.current) remoteVideo.current.srcObject = remoteStream;
    if (remoteAudio.current) remoteAudio.current.srcObject = remoteStream;
  }, [localStream, remoteStream, localCameraEnabled, remoteCameraEnabled, state.status]);

  useEffect(() => {
    if (state.status !== "connected") {
      setElapsed(0);
      return;
    }
    const started = Date.now();
    const timer = setInterval(() => setElapsed(Math.floor((Date.now() - started) / 1000)), 1000);
    return () => clearInterval(timer);
  }, [state.status, callId]);

  if (state.status === "idle") return null;

  const finishLabel = state.status === "ended" ? endedMessage(state) : null;
  const incoming = state.status === "incoming";
  const connected = state.status === "connected";
  const inCall = state.status === "connecting" || connected;

  return (
    <div class={styles.backdrop}>
      <section
        class={styles.panel}
        role="dialog"
        aria-modal="true"
        aria-labelledby="call-title"
        onKeyDown={(event) => {
          if (event.key === "Escape") {
            event.preventDefault();
            if (incoming) void calls.reject().catch(() => undefined);
            else if (inCall || state.status === "outgoing") void calls.hangup().catch(() => undefined);
          }
        }}
      >
        <header class={styles.header}>
          <div>
            <h2 id="call-title" class={styles.title}>
              {incoming ? "Appel entrant" : state.status === "outgoing" ? "Appel sortant" : connected ? "Appel en cours" : state.status === "ended" ? "Appel terminé" : "Connexion à l'appel"}
            </h2>
            <p class={styles.peer}>{peerName}</p>
          </div>
          {connected && <span class={styles.duration}>{formatDuration(elapsed)}</span>}
        </header>

        {incoming && (
          <div class={styles.incoming}>
            <p>{media === "video" ? "Appel vidéo" : "Appel vocal"}</p>
            <p>{peerName} vous appelle.</p>
            <div class={styles.actions}>
              <button ref={acceptRef} type="button" class={styles.primary} onClick={() => void calls.accept().catch(() => undefined)}>
                Accepter
              </button>
              <button type="button" class={styles.danger} onClick={() => void calls.reject().catch(() => undefined)}>
                Refuser
              </button>
            </div>
          </div>
        )}

        {state.status === "outgoing" && (
          <div class={styles.incoming}>
            <p>{media === "video" ? "Appel vidéo…" : "Appel vocal…"}</p>
            <p>En attente de réponse</p>
            <button type="button" class={styles.danger} onClick={() => void calls.hangup().catch(() => undefined)}>
              Annuler l'appel
            </button>
          </div>
        )}

        {inCall && (
          <div class={styles.media}>
            {media === "video" ? (
              <div class={styles.remote}>
                {remoteStream && remoteCameraEnabled ? (
                  <video ref={remoteVideo} autoPlay playsInline class={styles.remoteVideo} aria-label="Vidéo de votre correspondant" />
                ) : remoteStream && !remoteCameraEnabled ? (
                  <>
                    <p role="status">Caméra de {peerName} coupée</p>
                    <audio ref={remoteAudio} autoPlay />
                  </>
                ) : (
                  <p role="status">{connected ? "La vidéo de votre correspondant arrive…" : "Connexion média…"}</p>
                )}
                {localStream && localCameraEnabled ? (
                  <video ref={localVideo} autoPlay playsInline muted class={styles.localVideo} aria-label="Aperçu de votre caméra" />
                ) : localStream && !localCameraEnabled ? (
                  <p class={styles.localCameraOff} role="status">Votre caméra est coupée</p>
                ) : null}
              </div>
            ) : (
              <div class={styles.audio}>
                <span aria-hidden="true" class={styles.avatar}>{peerName.slice(0, 1).toUpperCase()}</span>
                <audio ref={remoteAudio} autoPlay />
                <p>{connected ? "Appel vocal connecté" : "Établissement de la connexion…"}</p>
              </div>
            )}
            {connected && (
              <div class={styles.actions}>
                <button
                  type="button"
                  class={calls.microphoneEnabled ? styles.secondary : styles.warning}
                  aria-pressed={!calls.microphoneEnabled}
                  onClick={() => calls.setMicrophoneEnabled(!calls.microphoneEnabled)}
                >
                  {calls.microphoneEnabled ? "Couper le micro" : "Rétablir le micro"}
                </button>
                {media === "video" && (
                  <button
                    type="button"
                    class={calls.cameraEnabled ? styles.secondary : styles.warning}
                    aria-pressed={!calls.cameraEnabled}
                    onClick={() => calls.setCameraEnabled(!calls.cameraEnabled)}
                  >
                    {calls.cameraEnabled ? "Couper la caméra" : "Rétablir la caméra"}
                  </button>
                )}
                <button type="button" class={styles.danger} onClick={() => void calls.hangup().catch(() => undefined)}>
                  Raccrocher
                </button>
              </div>
            )}
            {state.status === "connecting" && <p class={styles.status} role="status">Connexion en cours…</p>}
          </div>
        )}

        {state.status === "ended" && (
          <div class={styles.incoming}>
            <p role="status">{finishLabel}</p>
            <button type="button" class={styles.primary} onClick={() => calls.dismissEnded()}>
              Fermer
            </button>
          </div>
        )}
      </section>
    </div>
  );
}

function endedMessage(state: Extract<CallState, { status: "ended" }>): string {
  if (state.failure === "permission-denied") return "Accès au micro ou à la caméra refusé.";
  if (state.failure === "device-not-found") return "Aucun micro ou caméra disponible.";
  if (state.failure === "ice-failed") return "Impossible d'établir la connexion média.";
  if (state.failure === "network") return "Connexion au serveur perdue.";
  if (state.failure) return "L'appel n'a pas pu être établi.";
  switch (state.reason) {
    case "rejected": return "Appel refusé.";
    case "timeout": return "Sans réponse.";
    case "busy": return "Votre correspondant est déjà en appel.";
    case "disconnected": return "Connexion perdue.";
    case "removed": return "Vous avez été retiré de la conversation.";
    case "failed": return "Échec de l'appel.";
    default: return "Appel terminé.";
  }
}

function formatDuration(seconds: number): string {
  return `${Math.floor(seconds / 60).toString().padStart(2, "0")}:${(seconds % 60).toString().padStart(2, "0")}`;
}
