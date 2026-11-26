import { describe, expect, it } from "vitest";
import { transitionCallState, type CallState } from "./callState";

describe("call state machine", () => {
  it("keeps an invitation outgoing until the callee accepts", () => {
    let state: CallState = { status: "idle" };
    state = transitionCallState(state, { type: "outgoing", conversationId: "conv", peerId: "peer", media: "audio" });
    expect(state.status).toBe("outgoing");
    state = transitionCallState(state, { type: "identified", callId: "call" });
    expect(state.status).toBe("outgoing");
    expect(state).toMatchObject({ callId: "call" });
    state = transitionCallState(state, { type: "connecting" });
    expect(state.status).toBe("connecting");
    state = transitionCallState(state, { type: "connected" });
    expect(state.status).toBe("connected");
  });

  it("tracks incoming, candidate type and terminal reasons", () => {
    let state: CallState = { status: "idle" };
    state = transitionCallState(state, { type: "incoming", callId: "call", conversationId: "conv", peerId: "peer", media: "video" });
    expect(state.status).toBe("incoming");
    state = transitionCallState(state, { type: "connecting" });
    state = transitionCallState(state, { type: "candidate", candidateType: "relay" });
    expect(state).toMatchObject({ status: "connecting", candidateType: "relay" });
    state = transitionCallState(state, { type: "connected" });
    state = transitionCallState(state, { type: "ended", callId: "call", reason: "disconnected" });
    expect(state).toEqual({ status: "ended", callId: "call", reason: "disconnected" });
  });

  it("surfaces permission and ICE failures and allows a new call afterwards", () => {
    let state: CallState = { status: "idle" };
    state = transitionCallState(state, { type: "outgoing", conversationId: "conv", peerId: "peer", media: "audio" });
    state = transitionCallState(state, { type: "failed", callId: null, failure: "permission-denied" });
    expect(state).toEqual({ status: "ended", callId: null, failure: "permission-denied" });
    state = transitionCallState(state, { type: "outgoing", conversationId: "conv", peerId: "peer", media: "video" });
    expect(state.status).toBe("outgoing");
  });

  it("ignores invalid transitions instead of claiming a connected call", () => {
    const state = transitionCallState({ status: "idle" }, { type: "connected" });
    expect(state).toEqual({ status: "idle" });
    expect(transitionCallState(state, { type: "incoming", callId: "c", conversationId: "v", peerId: "p", media: "audio" }))
      .toMatchObject({ status: "incoming" });
  });
});
