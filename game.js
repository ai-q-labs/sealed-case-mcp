/**
 * Sealed Case for Alexa+ — the voice layer.
 *
 * One `createGame()` per MCP session. It owns one engine and turns every
 * engine result into something a voice assistant can say out loud:
 *
 *   { ok, speech, ...structured data }
 *
 * `speech` is plain spoken English, at most two sentences, no markdown and no
 * emoji. Longer material a player has to hear word for word (a suspect's
 * reply, what an object looks like up close) goes in its own field, and the
 * tool description tells the assistant to read it verbatim.
 *
 * This file never touches `solution`. It cannot: the engine does not hand it
 * out. Everything below is built from what the engine returns and from the
 * public parts of the case (suspects, objects, accusation options).
 */

import { createEngine, CASE, PHASES } from "./engine.js";

const MAX_SPEECH_SENTENCES = 2;

/** Normalise text for a speech engine: one line, no markdown, no dashes. */
export function say(text) {
  return String(text)
    .replace(/\s*\n\s*/g, " ")
    .replace(/\s*—\s*/g, ", ")
    .replace(/[*_#`]/g, "")
    .replace(/\s{2,}/g, " ")
    .trim();
}

/** Strip the wrapping quotes and line breaks from a written line of dialogue. */
function spoken(line) {
  return say(line).replace(/^"/, "").replace(/"$/, "");
}

export function countSentences(text) {
  const matches = String(text).match(/[.!?]["']?(?=\s|$)/g);
  return matches ? matches.length : 0;
}

// ---- natural-language resolution --------------------------------------------
// A voice assistant passes on what the player said. These tables turn "the
// owner", "the shochu" or "where was she" into engine ids. They are built only
// from public case material.

const SUSPECT_WORDS = {
  torii: ["torii", "sae", "novelist", "writer", "author"],
  kuroda: ["kuroda", "hajime", "owner", "bartender", "barman", "landlord"],
  onodera: ["onodera", "miyuki", "editor", "subordinate", "assistant"],
};

const OBJECT_WORDS = {
  bottle: ["bottle", "keep bottle", "shochu", "cork", "drink", "liquor"],
  glass: ["glass", "cup", "tumbler", "sink", "drying rack"],
  bolt: ["bolt", "lock", "bar", "bracket", "door"],
  ledger: ["ledger", "sign-in", "sign in", "register", "guest book", "members"],
  manuscript: ["manuscript", "novel", "paper bag", "receipt", "courier", "weir"],
  photograph: ["photograph", "photo", "picture", "frame on the shelf", "young woman"],
  clipping: ["clipping", "article", "newspaper", "stairwell frame", "akeboshi weekly"],
  back_door: ["back door", "back stair", "back stairs", "service stair", "kitchen door", "alley"],
};

const TOPIC_WORDS = {
  alibi: ["alibi", "where", "movements", "whereabouts", "tonight", "when", "timeline", "leave", "arrive"],
  victim: ["victim", "kadokura", "rentaro", "him", "dead man", "relationship", "boss"],
  bottle: OBJECT_WORDS.bottle,
  photograph: OBJECT_WORDS.photograph,
  clipping: [...OBJECT_WORDS.clipping, "1996", "librarian"],
  manuscript: OBJECT_WORDS.manuscript,
};

/** Rooms a player can say "search the ..." about, grouping the objects. */
export const LOCATIONS = {
  counter: {
    label: "the counter",
    words: ["counter", "bar", "shelf", "behind the bar", "behind the counter"],
    objects: ["bottle", "glass", "photograph"],
  },
  door: {
    label: "the door",
    words: ["door", "entrance", "front door", "bolt"],
    objects: ["bolt"],
  },
  stairwell: {
    label: "the stairwell",
    words: ["stairwell", "stairs", "staircase", "landing", "corridor"],
    objects: ["ledger", "clipping"],
  },
  coat_rack: {
    label: "the coat rack",
    words: ["coat rack", "coats", "coat", "hooks", "rack"],
    objects: ["manuscript"],
  },
  kitchen: {
    label: "the kitchen",
    words: ["kitchen", "back door", "back stair", "service", "alley"],
    objects: ["back_door"],
  },
};

function resolve(input, table) {
  if (input == null) return null;
  const said = String(input).toLowerCase().replace(/[_-]+/g, " ").trim();
  if (!said) return null;
  for (const id of Object.keys(table)) {
    if (said === id.replace(/_/g, " ")) return id;
  }
  // Longest keyword wins, so "back door" beats "door".
  let best = null;
  let bestLen = 0;
  for (const [id, words] of Object.entries(table)) {
    for (const w of words) {
      if (said.includes(w) && w.length > bestLen) {
        best = id;
        bestLen = w.length;
      }
    }
  }
  return best;
}

const locationWords = Object.fromEntries(
  Object.entries(LOCATIONS).map(([id, l]) => [id, l.words]),
);

// Short, speakable summaries of each object. The full description is returned
// alongside as `description`.
const OBJECT_SPEECH = {
  bottle:
    "Kadokura's keep bottle of shochu has a clean new cork. Every other bottle on the shelf has an old, stained one.",
  glass:
    "There is one half-full glass on the counter and no second glass anywhere. He drank alone.",
  bolt:
    "The iron bolt can only be dropped from inside the room. The only fingerprints on it are Kadokura's.",
  ledger:
    "The ledger shows Torii here from 22:30 to 23:15 and Onodera from 23:40 to 00:20. Kadokura signed in at 22:10 and never signed out, and the owner never signs.",
  manuscript:
    "It is Torii's novel, rejected by Kadokura eleven months ago. A courier receipt shows she sent it to another publisher today.",
  photograph:
    "A worn photograph of a laughing young woman, marked summer 1996, kept behind the counter.",
  clipping:
    "A framed 1996 article by Kadokura called a librarian's wartime documents a hoax. A note below says she was found dead three weeks later.",
  back_door:
    "The back stair leads down from the kitchen to the alley, and its key has not been moved tonight. It does not reach the Lantern Room anyway.",
};

const TOPIC_LABEL = {
  alibi: "where they were tonight",
  victim: "Kadokura",
  bottle: "the keep bottle",
  photograph: "the photograph",
  clipping: "the newspaper clipping",
  manuscript: "the manuscript",
};

const METHOD_WORDS = {
  forced_bolt: ["forced", "tool", "from the corridor", "worked the bolt", "picked"],
  hidden_exit: ["hidden", "secret", "second way", "other exit", "passage"],
  no_entry_needed: ["never in the room", "never had to be", "no entry", "from outside", "not in the room", "never entered"],
  accident: ["accident", "natural", "no one killed", "nobody killed", "suicide"],
};

const MOTIVE_WORDS = {
  rejected_manuscript: ["manuscript", "rejected", "novel", "book"],
  career: ["career", "position", "job", "promotion"],
  old_death: ["1996", "old death", "cousin", "librarian", "revenge", "past", "article"],
  none: ["no motive", "none", "nothing"],
};

// ---- the game ---------------------------------------------------------------

export function createGame(caseData = CASE) {
  const engine = createEngine(caseData);

  const suspectName = (id) => caseData.suspects.find((s) => s.id === id)?.name;
  const suspectIds = caseData.suspects.map((s) => s.id);

  function ensureOpen() {
    if (engine.get().phase === PHASES.BRIEFING) engine.beginInvestigation();
  }

  function notOpen() {
    const phase = engine.get().phase;
    if (phase === PHASES.VERDICT) {
      return {
        ok: false,
        phase,
        speech:
          "The accusation has already been made. You can reopen the case after a wrong answer, hear the ending after a right one, or start over.",
      };
    }
    return null;
  }

  const game = {
    engine, // exposed for tests only; mcp.js never passes it to a client

    startCase() {
      ensureOpen();
      const file = engine.caseFile();
      return {
        ok: true,
        speech:
          "Just after two in the morning, a publisher named Rentaro Kadokura was found dead at the bar of the Lantern Room, bolted in from the inside. Three people are still in the building, the police arrive at six, and it is up to you to say who did it.",
        briefing: say(file.briefing),
        victim: file.victim,
        police_arrive: file.police_arrive,
        suspects: engine.suspects().map((s) => ({ id: s.id, name: s.name, role: s.role })),
        places_to_search: Object.values(LOCATIONS).map((l) => l.label),
        questions_left: engine.get().interviewsLeft,
      };
    },

    /** The public case file, without changing any state. */
    caseFile() {
      const file = engine.caseFile();
      return {
        ok: true,
        title: file.title,
        where: file.where,
        briefing: say(file.briefing),
        victim: file.victim,
        police_arrive: file.police_arrive,
        suspects: engine.suspects(),
      };
    },

    listSuspects() {
      const list = engine.suspects();
      return {
        ok: true,
        speech: `The suspects are ${list
          .map((s) => `${s.name}, the ${lower(s.role.split(",")[0])}`)
          .join("; ")
          .replace(/; ([^;]*)$/, "; and $1")}.`,
        suspects: list,
      };
    },

    searchLocation(place) {
      const blocked = notOpen();
      if (blocked) return blocked;
      ensureOpen();
      const loc = resolve(place, locationWords);
      if (!loc) {
        return {
          ok: false,
          speech: `You can search the counter, the door, the stairwell, the coat rack or the kitchen.`,
          places: Object.keys(LOCATIONS),
        };
      }
      const l = LOCATIONS[loc];
      const examined = engine.get().examined;
      const items = l.objects.map((id) => ({
        id,
        label: caseData.objects[id].label,
        examined: examined.includes(id),
      }));
      const labels = items.map((i) => i.label.replace(/^The /, "the "));
      const names = labels.length > 1 ? `${labels.slice(0, -1).join(", ")} and ${labels.at(-1)}` : labels[0];
      return {
        ok: true,
        speech: `At ${l.label} you can see ${names}. Say which one you want to look at closely.`,
        location: loc,
        items,
      };
    },

    examineEvidence(item) {
      const blocked = notOpen();
      if (blocked) return blocked;
      ensureOpen();
      const id = resolve(item, OBJECT_WORDS);
      if (!id) {
        return {
          ok: false,
          speech:
            "I couldn't tell which object you meant. Try searching a place first to hear what is there.",
          objects: Object.keys(caseData.objects),
        };
      }
      const r = engine.examine(id);
      if (!r.ok) return { ok: false, speech: say(r.error) };
      return {
        ok: true,
        speech: OBJECT_SPEECH[id],
        item: id,
        label: r.label,
        where: r.where,
        description: say(r.found),
        new_to_you: r.new_to_you,
      };
    },

    questionSuspect(suspect, topic) {
      const blocked = notOpen();
      if (blocked) return blocked;
      ensureOpen();
      const who = resolve(suspect, SUSPECT_WORDS);
      if (!who) {
        return {
          ok: false,
          speech: "I can question Sae Torii, Hajime Kuroda or Miyuki Onodera. Which one?",
          suspects: suspectIds,
        };
      }
      const about = resolve(topic, TOPIC_WORDS);
      if (!about) {
        return {
          ok: false,
          speech: `You can ask ${suspectName(who)} about the victim, their alibi, the bottle, the photograph, the clipping or the manuscript. That did not use up a question.`,
          topics: Object.keys(TOPIC_WORDS),
        };
      }
      const r = engine.interview(who, about);
      if (!r.ok) return { ok: false, speech: say(r.error), questions_left: 0 };
      const left = r.questions_left;
      return {
        ok: true,
        speech: `${r.suspect} answers about ${TOPIC_LABEL[about]}. ${
          left === 0 ? "That was the last question anyone will answer." : `${left} question${left === 1 ? "" : "s"} left.`
        }`,
        suspect: r.suspect,
        topic: about,
        said: spoken(r.said),
        questions_left: left,
      };
    },

    reviewNotes() {
      const n = engine.notebook();
      const e = n.evidence.length;
      const t = n.testimony.length;
      return {
        ok: true,
        speech: `You have ${e} piece${e === 1 ? "" : "s"} of evidence and ${t} statement${
          t === 1 ? "" : "s"
        } in your notes. There are ${n.questions_left} questions left and ${n.unexamined.length} objects you have not examined.`,
        evidence: n.evidence,
        testimony: n.testimony.map(say),
        questions_left: n.questions_left,
        unexamined: n.unexamined,
      };
    },

    accusationOptions() {
      const o = engine.accusationOptions();
      return {
        ok: true,
        speech:
          "An accusation names a culprit, how it was done, and why. You can name any of the three suspects, or say no one killed him.",
        culprit: o.culprit,
        method: o.method,
        motive: o.motive,
      };
    },

    /**
     * Two-step by design. The first call stages the accusation and reads it
     * back. Only a second call with `confirmed: true`, naming the same three
     * choices, commits it — and only a committed accusation is graded.
     */
    accuse({ culprit, method, motive, confirmed = false }) {
      const blocked = notOpen();
      if (blocked) return blocked;
      ensureOpen();
      const c =
        /\b(no one|nobody|noone|nobody did|none of them)\b/i.test(String(culprit ?? ""))
          ? "nobody"
          : resolve(culprit, SUSPECT_WORDS);
      const m = caseData.options.method.some((x) => x.id === method) ? method : resolve(method, METHOD_WORDS);
      const w = caseData.options.motive.some((x) => x.id === motive) ? motive : resolve(motive, MOTIVE_WORDS);
      if (!c || !m || !w) {
        return {
          ok: false,
          speech:
            "An accusation needs a culprit, a method and a motive. Ask for the accusation options to hear the choices.",
          missing: { culprit: !c, method: !m, motive: !w },
          options: engine.accusationOptions(),
        };
      }

      const pending = engine.get().pending;
      const matches =
        pending && pending.culprit === c && pending.method === m && pending.motive === w;

      if (!confirmed || !matches) {
        const r = engine.proposeAccusation({ culprit: c, method: m, motive: w });
        if (!r.ok) return { ok: false, speech: say(r.error) };
        return {
          ok: true,
          committed: false,
          speech: say(
            `You are accusing ${r.staged.culprit}: ${lower(r.staged.method)}, ${lower(
              r.staged.motive,
            )}. Say yes to commit to it, or no to keep investigating.`,
          ),
          staged: { culprit: c, method: m, motive: w },
          readable: r.staged,
          ...(confirmed && !matches
            ? { note: "Nothing was committed: the player must first hear this accusation read back, then confirm it." }
            : {}),
        };
      }

      engine.confirmAccusation();
      const v = engine.get().verdict;
      if (v.correct) {
        return {
          ok: true,
          committed: true,
          correct: true,
          speech:
            "You're right, on every count. Say tell me what happened to hear how it was done.",
          accused: v.accused,
          parts: v.parts,
        };
      }
      const right = Object.entries(v.parts).filter(([, ok]) => ok).map(([k]) => k);
      return {
        ok: true,
        committed: true,
        correct: false,
        speech: `That's not the whole truth. ${say(v.hint).split(/(?<=[.!?])\s/)[0]}`,
        hint: say(v.hint),
        accused: v.accused,
        parts_right: right,
        next: "Say reopen the case to keep investigating with everything you have gathered.",
      };
    },

    withdrawAccusation() {
      if (!engine.get().pending) {
        return { ok: true, speech: "There is no accusation on the table." };
      }
      engine.withdrawAccusation();
      return { ok: true, speech: "The accusation is off the table. Keep investigating." };
    },

    hearEnding() {
      const r = engine.solutionText();
      if (!r.ok) {
        return {
          ok: false,
          speech: "The ending is only told once you have solved the case.",
        };
      }
      return {
        ok: true,
        speech: "Here is what really happened at the Lantern Room.",
        ending: say(r.epilogue),
      };
    },

    reopenCase() {
      const r = engine.reopen();
      if (!r.ok) {
        return {
          ok: false,
          speech:
            engine.get().phase === PHASES.VERDICT
              ? "The case is solved and closed. You can start over if you want to play again."
              : "The case is still open. Keep investigating.",
        };
      }
      return {
        ok: true,
        speech: `The case is open again, and your notes are intact. You have ${engine.get().interviewsLeft} questions left.`,
      };
    },

    restartCase() {
      engine.restart();
      return game.startCase();
    },

    progress() {
      const s = engine.get();
      const staged = s.pending
        ? `An accusation of ${s.pending.readable.culprit} is waiting for you to confirm it.`
        : null;
      const base =
        s.phase === PHASES.VERDICT
          ? s.verdict?.correct
            ? "You have solved the case."
            : "Your accusation was wrong; you can reopen the case."
          : s.phase === PHASES.BRIEFING
            ? "The case has not started yet."
            : `You have examined ${s.examined.length} of ${s.examined.length + s.objectsLeft} objects and have ${s.interviewsLeft} questions left.`;
      return {
        ok: true,
        speech: staged ? `${base} ${staged}` : base,
        phase: s.phase,
        examined: s.examined.length,
        objects_left: s.objectsLeft,
        questions_left: s.interviewsLeft,
        staged_accusation: s.pending ? s.pending.readable : null,
      };
    },
  };

  return game;
}

function lower(s) {
  return s.charAt(0).toLowerCase() + s.slice(1);
}

export { MAX_SPEECH_SENTENCES };
