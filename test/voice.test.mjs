/**
 * Every result must be sayable: a `speech` field of one or two plain
 * sentences, no markdown, no emoji. Checked on the game layer directly over a
 * scripted playthrough and a randomised run, so every branch that produces
 * speech is exercised.
 */

import test from "node:test";
import assert from "node:assert/strict";
import { createGame, countSentences, MAX_SPEECH_SENTENCES } from "../game.js";
import { rng, randomArgs, TOOL_NAMES } from "./helpers.mjs";

const CALL = {
  start_case: (g) => g.startCase(),
  list_suspects: (g) => g.listSuspects(),
  search_location: (g, a) => g.searchLocation(a.place),
  examine_evidence: (g, a) => g.examineEvidence(a.item),
  question_suspect: (g, a) => g.questionSuspect(a.suspect, a.topic),
  review_notes: (g) => g.reviewNotes(),
  get_progress: (g) => g.progress(),
  get_accusation_options: (g) => g.accusationOptions(),
  accuse: (g, a) => g.accuse(a),
  withdraw_accusation: (g) => g.withdrawAccusation(),
  hear_ending: (g) => g.hearEnding(),
  reopen_case: (g) => g.reopenCase(),
  restart_case: (g) => g.restartCase(),
};

const EMOJI = /\p{Extended_Pictographic}/u;
const MARKDOWN = /[*_#`\[\]<>|]|^\s*[-+]\s/;

function assertSayable(r, where) {
  assert.equal(typeof r.speech, "string", `${where}: no speech`);
  assert.ok(r.speech.length > 0, `${where}: empty speech`);
  const n = countSentences(r.speech);
  assert.ok(n >= 1 && n <= MAX_SPEECH_SENTENCES, `${where}: ${n} sentences: ${r.speech}`);
  assert.ok(!r.speech.includes("\n"), `${where}: line break in speech`);
  assert.ok(!EMOJI.test(r.speech), `${where}: emoji in speech`);
  assert.ok(!MARKDOWN.test(r.speech), `${where}: markdown in speech: ${r.speech}`);
  assert.ok(r.speech.length <= 320, `${where}: speech too long (${r.speech.length})`);
}

test("every result in a full playthrough has a short, plain speech field", () => {
  const g = createGame();
  const steps = [
    ["get_progress", {}],
    ["hear_ending", {}],
    ["start_case", {}],
    ["list_suspects", {}],
    ["search_location", {}],
    ...["counter", "door", "stairwell", "coat rack", "kitchen"].map((place) => ["search_location", { place }]),
    ...["bottle", "glass", "bolt", "ledger", "manuscript", "photograph", "clipping", "back door", "chandelier"].map(
      (item) => ["examine_evidence", { item }],
    ),
    ...["victim", "alibi", "bottle", "photograph", "clipping", "manuscript"].map((topic) => [
      "question_suspect",
      { suspect: "onodera", topic },
    ]),
    ["question_suspect", { suspect: "torii", topic: "the weather" }],
    ["question_suspect", { suspect: "nobody", topic: "alibi" }],
    ["question_suspect", { suspect: "torii", topic: "alibi" }],
    ["question_suspect", { suspect: "kuroda", topic: "alibi" }],
    ["question_suspect", { suspect: "kuroda", topic: "victim" }],
    ["review_notes", {}],
    ["get_accusation_options", {}],
    ["withdraw_accusation", {}],
    ["accuse", { culprit: "someone", method: "x", motive: "y" }],
    ["accuse", { culprit: "no one", method: "accident", motive: "none" }],
    ["get_progress", {}],
    ["withdraw_accusation", {}],
    ["accuse", { culprit: "torii", method: "forced_bolt", motive: "career" }],
    ["accuse", { culprit: "torii", method: "forced_bolt", motive: "career", confirmed: true }],
    ["get_progress", {}],
    ["examine_evidence", { item: "bottle" }],
    ["reopen_case", {}],
    ["accuse", { culprit: "kuroda", method: "forced_bolt", motive: "old_death" }],
    ["accuse", { culprit: "kuroda", method: "forced_bolt", motive: "old_death", confirmed: true }],
    ["reopen_case", {}],
    ["accuse", { culprit: "kuroda", method: "no_entry_needed", motive: "career" }],
    ["accuse", { culprit: "kuroda", method: "no_entry_needed", motive: "career", confirmed: true }],
    ["reopen_case", {}],
    ["accuse", { culprit: "kuroda", method: "no_entry_needed", motive: "old_death" }],
    ["accuse", { culprit: "kuroda", method: "no_entry_needed", motive: "old_death", confirmed: true }],
    ["hear_ending", {}],
    ["reopen_case", {}],
    ["get_progress", {}],
    ["restart_case", {}],
  ];
  for (const [tool, args] of steps) assertSayable(CALL[tool](g, args), `${tool} ${JSON.stringify(args)}`);
});

test("randomised calls always produce sayable results", () => {
  for (const seed of [11, 12, 13, 14, 15]) {
    const r = rng(seed);
    const g = createGame();
    for (let i = 0; i < 200; i++) {
      const tool = TOOL_NAMES[Math.floor(r() * TOOL_NAMES.length)];
      const args = randomArgs(tool, r);
      assertSayable(CALL[tool](g, args), `seed ${seed} #${i} ${tool} ${JSON.stringify(args)}`);
    }
  }
});

test("natural phrasing resolves to the right object, suspect and topic", () => {
  const g = createGame();
  g.startCase();
  assert.equal(g.examineEvidence("the shochu behind the bar").item, "bottle");
  assert.equal(g.examineEvidence("the lock on the door").item, "bolt");
  assert.equal(g.examineEvidence("the back door").item, "back_door");
  assert.equal(g.examineEvidence("that old newspaper article").item, "clipping");
  assert.equal(g.searchLocation("look behind the counter").location, "counter");
  assert.equal(g.searchLocation("the back door in the kitchen").location, "kitchen");
  const q = g.questionSuspect("the novelist", "where was she tonight");
  assert.equal(q.suspect, "Sae Torii");
  assert.equal(q.topic, "alibi");
});

test("a misheard topic does not use up a question", () => {
  const g = createGame();
  g.startCase();
  const r = g.questionSuspect("kuroda", "the weather");
  assert.equal(r.ok, false);
  assert.equal(g.progress().questions_left, 8);
});
