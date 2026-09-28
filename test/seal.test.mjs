/**
 * The claim this project makes: before an accusation is committed, nothing a
 * client can reach over MCP carries the solution.
 *
 * The culprit's name cannot simply be grepped for — Hajime Kuroda is one of
 * three suspects, so his name is (correctly) in the suspect list, the ledger
 * and the testimony. So the seal is checked two ways, both through a real MCP
 * client against the running server:
 *
 *  1. Marker grep. Every response, resource, prompt and error is searched for
 *     text that exists only in the solution (the epilogue, the near-miss
 *     hints, the method detail).
 *  2. Differential. The same calls are replayed against a server whose case
 *     has a DIFFERENT culprit, method and motive. If any pre-commit response
 *     differs by a single byte, the response depended on the solution. That
 *     covers the culprit's identity in any form, including ones no one
 *     thought to grep for.
 */

import test from "node:test";
import assert from "node:assert/strict";
import {
  startServer,
  connect,
  alternateCase,
  solutionMarkers,
  findLeak,
  rng,
  randomArgs,
  TOOL_NAMES,
} from "./helpers.mjs";

const MARKERS = solutionMarkers();

/** A scripted playthrough that stops just before the accusation is committed. */
const SCRIPT = [
  ["get_progress", {}],
  ["hear_ending", {}],
  ["start_case", {}],
  ["list_suspects", {}],
  ["search_location", {}],
  ["search_location", { place: "behind the counter" }],
  ["examine_evidence", { item: "the keep bottle" }],
  ["examine_evidence", { item: "glass" }],
  ["examine_evidence", { item: "photo" }],
  ["search_location", { place: "the door" }],
  ["examine_evidence", { item: "the lock" }],
  ["search_location", { place: "stairs" }],
  ["examine_evidence", { item: "ledger" }],
  ["examine_evidence", { item: "newspaper clipping" }],
  ["search_location", { place: "coat rack" }],
  ["examine_evidence", { item: "manuscript" }],
  ["search_location", { place: "kitchen" }],
  ["examine_evidence", { item: "back door" }],
  ["question_suspect", { suspect: "the owner", topic: "where were you" }],
  ["question_suspect", { suspect: "Kuroda", topic: "the photograph" }],
  ["question_suspect", { suspect: "the editor", topic: "photo" }],
  ["question_suspect", { suspect: "Onodera", topic: "the clipping" }],
  ["question_suspect", { suspect: "Torii", topic: "the bottle" }],
  ["question_suspect", { suspect: "Torii", topic: "the weather" }],
  ["review_notes", {}],
  ["get_accusation_options", {}],
  ["hear_ending", {}],
  ["reopen_case", {}],
  ["accuse", { culprit: "Kuroda", method: "no_entry_needed", motive: "old_death", confirmed: true }],
  ["get_progress", {}],
  ["withdraw_accusation", {}],
  ["accuse", { culprit: "Torii", method: "forced_bolt", motive: "rejected_manuscript" }],
  ["accuse", { culprit: "Kuroda", method: "no_entry_needed", motive: "old_death" }],
  ["hear_ending", {}],
];

async function surfaceDump(c) {
  const out = [];
  out.push(JSON.stringify(await c.client.listTools()));
  const res = await c.client.listResources();
  out.push(JSON.stringify(res));
  for (const r of res.resources) out.push(JSON.stringify(await c.client.readResource({ uri: r.uri })));
  const prompts = await c.client.listPrompts();
  out.push(JSON.stringify(prompts));
  for (const p of prompts.prompts) out.push(JSON.stringify(await c.client.getPrompt({ name: p.name })));
  out.push(JSON.stringify(c.client.getInstructions() ?? ""));
  // Error paths: unknown tool, schema violation, unknown resource, unknown prompt.
  for (const bad of [
    () => c.client.callTool({ name: "confirm_accusation", arguments: {} }),
    () => c.client.callTool({ name: "get_solution", arguments: {} }),
    () => c.client.callTool({ name: "accuse", arguments: { culprit: 7 } }),
    () => c.client.callTool({ name: "question_suspect", arguments: {} }),
    () => c.client.readResource({ uri: "sealed-case://lantern-room/solution" }),
    () => c.client.getPrompt({ name: "reveal" }),
  ]) {
    try {
      out.push(JSON.stringify(await bad()));
    } catch (err) {
      out.push(`ERROR ${err.message}`);
    }
  }
  return out;
}

test("no tool, resource, prompt or error carries the solution before commit (marker grep)", async () => {
  const srv = await startServer();
  const c = await connect(srv.url);
  try {
    const seen = await surfaceDump(c);
    for (const [name, args] of SCRIPT) seen.push((await c.call(name, args)).raw);
    // Raw HTTP errors too: bad session id, no initialize.
    for (const init of [
      { method: "POST", headers: { "content-type": "application/json", accept: "application/json, text/event-stream", "mcp-session-id": "not-a-session" }, body: "{}" },
      { method: "POST", headers: { "content-type": "application/json", accept: "application/json, text/event-stream" }, body: JSON.stringify({ jsonrpc: "2.0", id: 1, method: "tools/list" }) },
      { method: "GET", headers: {} },
    ]) {
      const r = await fetch(srv.url, init);
      seen.push(await r.text());
    }
    assert.ok(seen.length > SCRIPT.length);
    for (const raw of seen) {
      const leak = findLeak(raw, MARKERS);
      assert.equal(leak, null, `solution text leaked: "${leak}" in ${raw.slice(0, 200)}`);
    }
  } finally {
    await c.close();
    await srv.close();
  }
});

test("pre-commit responses are byte-identical when the solution changes (scripted)", async () => {
  const real = await startServer();
  const alt = await startServer(alternateCase());
  const a = await connect(real.url);
  const b = await connect(alt.url);
  try {
    assert.deepEqual(await surfaceDump(a), await surfaceDump(b));
    for (const [name, args] of SCRIPT) {
      const ra = await a.call(name, args);
      const rb = await b.call(name, args);
      assert.equal(ra.raw, rb.raw, `${name} ${JSON.stringify(args)} depends on the solution`);
      assert.notEqual(ra.data?.committed, true, "the script must not commit");
    }
  } finally {
    await Promise.all([a.close(), b.close()]);
    await Promise.all([real.close(), alt.close()]);
  }
});

test("randomised tool-call fuzzing: identical across solutions and no markers, until commit", async (t) => {
  const real = await startServer();
  const alt = await startServer(alternateCase());
  let calls = 0;
  let commits = 0;
  try {
    for (const seed of [1, 2, 3, 4, 5, 6, 7, 8]) {
      const r = rng(seed);
      const a = await connect(real.url, `fuzz-a-${seed}`);
      const b = await connect(alt.url, `fuzz-b-${seed}`);
      try {
        let last = null;
        for (let i = 0; i < 150; i++) {
          const tool = TOOL_NAMES[Math.floor(r() * TOOL_NAMES.length)];
          // A third of the time, confirm whatever was just staged, so commits really happen.
          const args = tool === "accuse" && last && r() < 0.35 ? { ...last, confirmed: true } : randomArgs(tool, r);
          if (tool === "accuse") last = { culprit: args.culprit, method: args.method, motive: args.motive };
          const ra = await a.call(tool, args);
          const rb = await b.call(tool, args);
          calls++;
          if (ra.data?.committed === true || rb.data?.committed === true) {
            // Both engines must reach the commit on the same call. The verdicts
            // may differ from here, so start both games over and keep going.
            assert.equal(ra.data?.committed, rb.data?.committed, "commit must not depend on the solution");
            commits++;
            const [sa, sb] = [await a.call("restart_case"), await b.call("restart_case")];
            assert.equal(sa.raw, sb.raw, "restart must wipe everything that depended on the verdict");
            continue;
          }
          assert.equal(ra.raw, rb.raw, `seed ${seed} call ${i}: ${tool} ${JSON.stringify(args)} depends on the solution`);
          const leak = findLeak(ra.raw, MARKERS);
          assert.equal(leak, null, `seed ${seed} call ${i}: leaked "${leak}"`);
        }
      } finally {
        await Promise.all([a.close(), b.close()]);
      }
    }
    assert.ok(calls >= 1000, `fuzzing made only ${calls} calls`);
    assert.ok(commits >= 3, `fuzzing committed only ${commits} accusations`);
    t.diagnostic(`fuzz calls: ${calls}, committed accusations (each followed by restart_case): ${commits}`);
  } finally {
    await Promise.all([real.close(), alt.close()]);
  }
});

test("accuse cannot be committed in one call", async () => {
  const srv = await startServer();
  const c = await connect(srv.url);
  try {
    await c.call("start_case");
    const r = await c.call("accuse", { culprit: "kuroda", method: "no_entry_needed", motive: "old_death", confirmed: true });
    assert.equal(r.data.committed, false);
    assert.equal(r.data.correct, undefined);
    const p = await c.call("get_progress");
    assert.equal(p.data.phase, "investigation");
  } finally {
    await c.close();
    await srv.close();
  }
});
