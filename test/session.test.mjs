/**
 * End to end through the SDK's own Client and StreamableHTTPClientTransport
 * against the running server: protocol version, a full playthrough to a
 * correct verdict, and two players at once.
 */

import test from "node:test";
import assert from "node:assert/strict";
import { LATEST_PROTOCOL_VERSION } from "@modelcontextprotocol/sdk/types.js";
import { startServer, connect, TOOL_NAMES } from "./helpers.mjs";

test("negotiates MCP protocol 2025-11-25 over Streamable HTTP and issues a session id", async () => {
  const srv = await startServer();
  const c = await connect(srv.url);
  try {
    assert.equal(LATEST_PROTOCOL_VERSION, "2025-11-25");
    assert.equal(c.transport.protocolVersion, "2025-11-25");
    assert.match(c.transport.sessionId, /^[0-9a-f-]{36}$/);
    const tools = (await c.client.listTools()).tools.map((t) => t.name).sort();
    assert.deepEqual(tools, [...TOOL_NAMES].sort());
    assert.ok(!tools.includes("confirm_accusation"));
  } finally {
    await c.close();
    await srv.close();
  }
});

test("a full playthrough over MCP reaches the correct verdict", async () => {
  const srv = await startServer();
  const c = await connect(srv.url);
  try {
    const start = await c.call("start_case");
    assert.equal(start.data.ok, true);
    assert.equal(start.data.suspects.length, 3);

    for (const item of ["bottle", "glass", "bolt", "ledger", "photograph", "clipping"]) {
      const r = await c.call("examine_evidence", { item });
      assert.equal(r.data.ok, true, item);
      assert.ok(r.data.description.length > r.data.speech.length, `${item} has more detail than the speech`);
    }
    const q1 = await c.call("question_suspect", { suspect: "the owner", topic: "the photograph" });
    assert.equal(q1.data.suspect, "Hajime Kuroda");
    assert.match(q1.data.said, /cousin/);
    const q2 = await c.call("question_suspect", { suspect: "the editor", topic: "photograph" });
    assert.equal(q2.data.questions_left, 6);

    const early = await c.call("hear_ending");
    assert.equal(early.data.ok, false, "the ending is refused before the case is solved");

    // First a wrong accusation, committed, then reopen.
    await c.call("accuse", { culprit: "Torii", method: "forced_bolt", motive: "rejected manuscript" });
    const wrong = await c.call("accuse", {
      culprit: "Torii",
      method: "forced_bolt",
      motive: "rejected manuscript",
      confirmed: true,
    });
    assert.equal(wrong.data.committed, true);
    assert.equal(wrong.data.correct, false);
    assert.equal((await c.call("hear_ending")).data.ok, false);
    const reopened = await c.call("reopen_case");
    assert.equal(reopened.data.ok, true);

    // Then the right one, in plain words, read back, then confirmed.
    const staged = await c.call("accuse", {
      culprit: "the bar owner",
      method: "the killer never had to be in the room",
      motive: "a death in 1996",
    });
    assert.equal(staged.data.committed, false);
    assert.deepEqual(staged.data.staged, { culprit: "kuroda", method: "no_entry_needed", motive: "old_death" });
    assert.match(staged.data.speech, /Say yes/);

    const verdict = await c.call("accuse", {
      culprit: "the bar owner",
      method: "the killer never had to be in the room",
      motive: "a death in 1996",
      confirmed: true,
    });
    assert.equal(verdict.data.committed, true);
    assert.equal(verdict.data.correct, true);
    assert.deepEqual(verdict.data.parts, { culprit: true, method: true, motive: true });

    const ending = await c.call("hear_ending");
    assert.equal(ending.data.ok, true);
    assert.match(ending.data.ending, /aconite/);
  } finally {
    await c.close();
    await srv.close();
  }
});

test("two concurrent sessions do not share state", async () => {
  const srv = await startServer();
  const a = await connect(srv.url, "player-a");
  const b = await connect(srv.url, "player-b");
  try {
    assert.notEqual(a.transport.sessionId, b.transport.sessionId);
    assert.equal(srv.sessions.size, 2);

    await Promise.all([a.call("start_case"), b.call("start_case")]);
    // Interleave: A works the room, B asks questions, at the same time.
    await Promise.all([
      a.call("examine_evidence", { item: "bottle" }),
      b.call("question_suspect", { suspect: "torii", topic: "alibi" }),
      a.call("examine_evidence", { item: "ledger" }),
      b.call("question_suspect", { suspect: "kuroda", topic: "alibi" }),
    ]);

    const [na, nb] = await Promise.all([a.call("review_notes"), b.call("review_notes")]);
    assert.equal(na.data.evidence.length, 2);
    assert.equal(na.data.testimony.length, 0);
    assert.equal(na.data.questions_left, 8);
    assert.equal(nb.data.evidence.length, 0);
    assert.equal(nb.data.testimony.length, 2);
    assert.equal(nb.data.questions_left, 6);

    // A stages an accusation; B must not see it and cannot confirm it.
    await a.call("accuse", { culprit: "onodera", method: "hidden_exit", motive: "career" });
    const pb = await b.call("get_progress");
    assert.equal(pb.data.staged_accusation, null);
    const hijack = await b.call("accuse", { culprit: "onodera", method: "hidden_exit", motive: "career", confirmed: true });
    assert.equal(hijack.data.committed, false, "B's confirm cannot commit A's accusation");

    // A commits; B is still investigating.
    const va = await a.call("accuse", { culprit: "onodera", method: "hidden_exit", motive: "career", confirmed: true });
    assert.equal(va.data.committed, true);
    assert.equal((await a.call("get_progress")).data.phase, "verdict");
    assert.equal((await b.call("get_progress")).data.phase, "investigation");

    // Closing A's session removes only A.
    await a.transport.terminateSession();
    assert.equal(srv.sessions.size, 1);
    assert.equal((await b.call("get_progress")).data.phase, "investigation");
  } finally {
    await Promise.all([a.close(), b.close()]);
    await srv.close();
  }
});

test("an unknown session id is rejected, not given someone else's game", async () => {
  const srv = await startServer();
  try {
    const r = await fetch(srv.url, {
      method: "POST",
      headers: {
        "content-type": "application/json",
        accept: "application/json, text/event-stream",
        "mcp-session-id": "00000000-0000-0000-0000-000000000000",
      },
      body: JSON.stringify({ jsonrpc: "2.0", id: 1, method: "tools/call", params: { name: "review_notes", arguments: {} } }),
    });
    assert.equal(r.status, 404);
  } finally {
    await srv.close();
  }
});
