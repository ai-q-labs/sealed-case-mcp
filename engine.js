/**
 * Sealed Case — game engine.
 *
 * Provenance: copied from Sealed Case (https://github.com/ai-q-labs/sealed-case,
 * MIT, Copyright (c) 2026 Ai-Q Labs, written August 2026). Changes for the MCP
 * server: `createEngine()` now takes the case as a parameter (default: The
 * Lantern Room) so that each MCP session gets its own engine and the tests can
 * run the same calls against a case with a different solution. The game logic
 * is otherwise unchanged.
 *
 * The whole point of this file is what it does NOT return.
 *
 * `C.solution` is captured in this closure and is never included in any value
 * handed back to a caller. The MCP tools in mcp.js reach the game only through
 * game.js, which reaches it only through the object returned by
 * `createEngine()`, so a client that calls every tool in every order still
 * cannot read the culprit, the method or the motive. It can only do what a
 * player can do: gather evidence and be told, after an accusation is
 * committed, whether it was right.
 */

import { CASE } from "./case/lantern-room.js";

export const PHASES = {
  BRIEFING: "briefing",
  INVESTIGATION: "investigation",
  VERDICT: "verdict",
};

const INTERVIEW_BUDGET = 8;

export function createEngine(C = CASE) {
  // ---- private state -------------------------------------------------------
  const solution = C.solution; // never escapes this closure
  const listeners = new Set();

  const state = {
    phase: PHASES.BRIEFING,
    examined: [], // object ids, in the order found
    notebook: [], // { kind, text }
    interviews: [], // { suspect, topic, line }
    interviewsLeft: INTERVIEW_BUDGET,
    pending: null, // an accusation awaiting the human's confirmation
    verdict: null, // { correct, parts, epilogue|hint }
  };

  function emit() {
    for (const fn of listeners) fn(snapshot());
  }

  function note(kind, text) {
    state.notebook.push({ kind, text });
  }

  /** A read-only view. Deliberately contains no solution material. */
  function snapshot() {
    return {
      phase: state.phase,
      examined: [...state.examined],
      notebook: state.notebook.map((n) => ({ ...n })),
      interviews: state.interviews.map((i) => ({ ...i })),
      interviewsLeft: state.interviewsLeft,
      pending: state.pending ? { ...state.pending } : null,
      verdict: state.verdict ? { ...state.verdict } : null,
      objectsLeft: Object.keys(C.objects).filter(
        (k) => !state.examined.includes(k),
      ).length,
    };
  }

  function label(kind, id) {
    if (kind === "culprit") {
      const s = C.suspects.find((x) => x.id === id);
      return s ? s.name : "no one";
    }
    const found = C.options[kind].find((o) => o.id === id);
    return found ? found.label : id;
  }

  // ---- actions -------------------------------------------------------------

  const api = {
    subscribe(fn) {
      listeners.add(fn);
      fn(snapshot());
      return () => listeners.delete(fn);
    },

    get: snapshot,

    /** Static reference material. Safe to hand to anyone. */
    caseFile() {
      return {
        title: C.title,
        where: C.subtitle,
        briefing: C.briefing,
        victim: C.victim,
        police_arrive: "06:00",
      };
    },

    suspects() {
      return C.suspects.map(({ id, name, age, role, visible }) => ({
        id,
        name,
        age,
        role,
        known_movements: visible,
      }));
    },

    /** What is left in the room to look at. */
    searchable() {
      return Object.entries(C.objects).map(([id, o]) => ({
        id,
        label: o.label,
        where: o.where,
        examined: state.examined.includes(id),
      }));
    },

    beginInvestigation() {
      if (state.phase !== PHASES.BRIEFING) {
        return { ok: false, error: "The investigation is already open." };
      }
      state.phase = PHASES.INVESTIGATION;
      emit();
      return { ok: true, phase: state.phase };
    },

    examine(id) {
      if (state.phase !== PHASES.INVESTIGATION) {
        return { ok: false, error: "You cannot search the room in this phase." };
      }
      const obj = C.objects[id];
      if (!obj) {
        return {
          ok: false,
          error: `Nothing here by that name.`,
          available: Object.keys(C.objects),
        };
      }
      const first = !state.examined.includes(id);
      if (first) {
        state.examined.push(id);
        note("evidence", obj.note);
        emit();
      }
      return {
        ok: true,
        label: obj.label,
        where: obj.where,
        found: obj.reveals,
        new_to_you: first,
      };
    },

    interview(suspectId, topic) {
      if (state.phase !== PHASES.INVESTIGATION) {
        return { ok: false, error: "No one is answering questions in this phase." };
      }
      const suspect = C.suspects.find((s) => s.id === suspectId);
      if (!suspect) {
        return {
          ok: false,
          error: "There is no one here by that name.",
          available: C.suspects.map((s) => s.id),
        };
      }
      if (state.interviewsLeft <= 0) {
        return {
          ok: false,
          error:
            "They have stopped answering. It is nearly six and they have said all they intend to say.",
        };
      }
      const lines = C.interviews[suspectId] || {};
      const line = lines[topic] || C.no_comment[suspectId];
      const onTopic = Boolean(lines[topic]);

      state.interviewsLeft -= 1;
      state.interviews.push({ suspect: suspect.name, topic, line });
      if (onTopic) note("testimony", `${suspect.name} on ${topic}: ${line}`);
      emit();

      return {
        ok: true,
        suspect: suspect.name,
        topic,
        said: line,
        questions_left: state.interviewsLeft,
        topics_they_will_discuss: Object.keys(lines),
      };
    },

    notebook() {
      return {
        evidence: state.notebook.filter((n) => n.kind === "evidence").map((n) => n.text),
        testimony: state.notebook.filter((n) => n.kind === "testimony").map((n) => n.text),
        questions_left: state.interviewsLeft,
        unexamined: Object.entries(C.objects)
          .filter(([id]) => !state.examined.includes(id))
          .map(([id, o]) => `${id} (${o.where})`),
      };
    },

    /** The choices an accusation must be assembled from. */
    accusationOptions() {
      return {
        culprit: C.suspects.map((s) => ({ id: s.id, label: s.name })).concat([
          { id: "nobody", label: "No one — this was not a murder" },
        ]),
        method: C.options.method,
        motive: C.options.motive,
      };
    },

    /**
     * An agent can only ever get this far. The accusation is staged and the
     * page raises a confirmation card; nothing is resolved until a human
     * clicks it. `confirmAccusation` is intentionally not exposed as a tool.
     */
    proposeAccusation({ culprit, method, motive, reasoning = "" }) {
      if (state.phase !== PHASES.INVESTIGATION) {
        return { ok: false, error: "There is nothing left to accuse." };
      }
      const valid =
        C.options.culprit.includes(culprit) &&
        C.options.method.some((m) => m.id === method) &&
        C.options.motive.some((m) => m.id === motive);
      if (!valid) {
        return {
          ok: false,
          error: "That is not an accusation this room can hear.",
          options: api.accusationOptions(),
        };
      }
      state.pending = {
        culprit,
        method,
        motive,
        reasoning,
        readable: {
          culprit: label("culprit", culprit),
          method: label("method", method),
          motive: label("motive", motive),
        },
      };
      emit();
      return {
        ok: true,
        staged: state.pending.readable,
        awaiting: "human_confirmation",
        message:
          "The accusation is on the table. It does not leave this room until the player confirms it. You cannot confirm it yourself.",
      };
    },

    withdrawAccusation() {
      state.pending = null;
      emit();
      return { ok: true };
    },

    /** Human-only. Called from a click handler, never from a tool. */
    confirmAccusation() {
      if (!state.pending) return { ok: false, error: "Nothing is staged." };
      const a = state.pending;
      const parts = {
        culprit: a.culprit === solution.culprit,
        method: a.method === solution.method,
        motive: a.motive === solution.motive,
      };
      const correct = parts.culprit && parts.method && parts.motive;

      let hint = null;
      if (!correct) {
        if (!parts.culprit) hint = solution.near_miss.culprit;
        else if (!parts.method) hint = solution.near_miss.method;
        else hint = solution.near_miss.motive;
      }

      state.verdict = {
        correct,
        parts,
        accused: a.readable,
        epilogue: correct ? solution.epilogue : null,
        hint,
      };
      state.pending = null;
      state.phase = PHASES.VERDICT;
      emit();
      return { ok: true, correct };
    },

    /** After a wrong accusation the player may go back and keep working. */
    reopen() {
      if (state.phase !== PHASES.VERDICT || state.verdict?.correct) {
        return { ok: false, error: "The case is closed." };
      }
      state.verdict = null;
      state.phase = PHASES.INVESTIGATION;
      emit();
      return { ok: true, phase: state.phase };
    },

    /**
     * Read the closing text. Only ever available once the human has confirmed a
     * correct accusation — the phase check is the gate, not the caller's word.
     */
    solutionText() {
      if (state.phase !== PHASES.VERDICT || !state.verdict?.correct) {
        return { ok: false, error: "The case is not solved." };
      }
      return { ok: true, epilogue: solution.epilogue };
    },

    restart() {
      state.phase = PHASES.BRIEFING;
      state.examined = [];
      state.notebook = [];
      state.interviews = [];
      state.interviewsLeft = INTERVIEW_BUDGET;
      state.pending = null;
      state.verdict = null;
      emit();
      return { ok: true };
    },
  };

  return api;
}

export { CASE };
