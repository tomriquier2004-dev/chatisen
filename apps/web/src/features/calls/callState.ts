import type { CallEndReason, CallMedia, IceCandidateType } from "@chatisen/shared";

export type CallFailure = "permission-denied" | "device-not-found" | "ice-failed" | "network" | "unknown";

export type CallState =
  | { status: "idle" }
  | { status: "outgoing"; callId: string | null; conversationId: string; peerId: string; media: CallMedia }
  | { status: "incoming"; callId: string; conversationId: string; peerId: string; media: CallMedia }
  | { status: "connecting"; callId: string; conversationId: string; peerId: string; media: CallMedia; candidateType: IceCandidateType | null }
  | { status: "connected"; callId: string; conversationId: string; peerId: string; media: CallMedia; candidateType: IceCandidateType | null }
  | { status: "ended"; callId: string | null; reason?: CallEndReason; failure?: CallFailure };

export type CallAction =
  | { type: "outgoing"; conversationId: string; peerId: string; media: CallMedia }
  | { type: "incoming"; callId: string; conversationId: string; peerId: string; media: CallMedia }
  | { type: "identified"; callId: string }
  | { type: "connecting" }
  | { type: "connected" }
  | { type: "candidate"; candidateType: IceCandidateType }
  | { type: "ended"; callId: string | null; reason: CallEndReason }
  | { type: "failed"; callId: string | null; failure: CallFailure }
  | { type: "reset" };

/** Machine à états explicite : un ACK d'invitation ne fait jamais passer à connected. */
export function transitionCallState(state: CallState, action: CallAction): CallState {
  if (action.type === "reset") return { status: "idle" };
  if (action.type === "outgoing") {
    if (state.status !== "idle" && state.status !== "ended") return state;
    return { status: "outgoing", callId: null, conversationId: action.conversationId, peerId: action.peerId, media: action.media };
  }
  if (action.type === "incoming") {
    if (state.status !== "idle" && state.status !== "ended") return state;
    return { status: "incoming", callId: action.callId, conversationId: action.conversationId, peerId: action.peerId, media: action.media };
  }
  if (action.type === "identified" && state.status === "outgoing") return { ...state, callId: action.callId };
  if (action.type === "connecting") {
    if (state.status === "outgoing" && state.callId) {
      return { status: "connecting", callId: state.callId, conversationId: state.conversationId, peerId: state.peerId, media: state.media, candidateType: null };
    }
    if (state.status === "incoming") {
      return { status: "connecting", ...state, candidateType: null };
    }
  }
  if (action.type === "connected" && state.status === "connecting") return { ...state, status: "connected" };
  if (action.type === "candidate" && (state.status === "connecting" || state.status === "connected")) {
    return { ...state, candidateType: action.candidateType };
  }
  if (action.type === "ended") return { status: "ended", callId: action.callId, reason: action.reason };
  if (action.type === "failed") return { status: "ended", callId: action.callId, failure: action.failure };
  return state;
}
