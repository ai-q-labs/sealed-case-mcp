/**
 * The Lantern Room — case data.
 *
 * Provenance: copied unchanged from Sealed Case
 * (https://github.com/ai-q-labs/sealed-case, MIT, Copyright (c) 2026 Ai-Q Labs).
 * The scenario is original and entirely fictional.
 *
 * IMPORTANT: this module is the only place the solution exists. It is imported
 * by engine.js, which keeps it inside a closure and never returns `solution`
 * from a tool. In the MCP server it never leaves the server process: no tool
 * result, resource, prompt or error message carries it before an accusation
 * has been committed.
 */

export const CASE = {
  id: "lantern-room",
  title: "The Lantern Room",
  subtitle: "Jimbocho, Tokyo — 02:40",

  briefing: `A private bar on the second floor of a second-hand bookshop in Jimbocho.
Four people were in the building tonight. At 02:40 the owner found Rentaro Kadokura —
sixty-one, chief editor at Akeboshi Publishing — dead at the counter, a half-finished
glass in front of him.

The door to the Lantern Room was bolted from the inside. The bolt is a solid iron bar
that drops into a bracket; it cannot be worked from the corridor. The only window is
painted shut and has been for years. There is no other way in.

The police will arrive at 06:00. Until then, the three people still in the building
have agreed to answer your questions.`,

  victim: {
    name: "Rentaro Kadokura",
    age: 61,
    role: "Chief editor, Akeboshi Publishing",
    note: "A regular here for thirty years. Kept a bottle behind the counter with his name on it.",
  },

  suspects: [
    {
      id: "torii",
      name: "Sae Torii",
      age: 29,
      role: "Novelist, unpublished",
      visible: "Arrived 22:30, left 23:15. Came to collect a manuscript Kadokura had been sitting on for eleven months.",
    },
    {
      id: "kuroda",
      name: "Hajime Kuroda",
      age: 58,
      role: "Owner of the Lantern Room",
      visible: "Here all night, as always. Says he was downstairs in the shop from 01:00, doing the books.",
    },
    {
      id: "onodera",
      name: "Miyuki Onodera",
      age: 34,
      role: "Editor, Akeboshi Publishing — Kadokura's subordinate",
      visible: "Arrived 23:40, left 00:20. Came to have a proof signed off.",
    },
  ],

  /**
   * Everything the player can physically look at. `reveals` is the text the
   * page hands back the first time. `note` is what goes into the notebook.
   */
  objects: {
    bottle: {
      label: "The keep bottle",
      where: "behind the counter",
      reveals: `A squat bottle of shochu with a paper collar around the neck: KADOKURA, in brush ink,
the characters faded and re-inked several times over the years. Roughly a third gone.

The cork is clean and pale. Every other keep bottle on the shelf has a cork stained dark
by years of being pushed back in. This one has been replaced recently.`,
      note: "Kadokura's keep bottle has a new cork; the others on the shelf are old and stained.",
    },
    glass: {
      label: "The glass",
      where: "on the counter",
      reveals: `One glass, about half full. One glass only — nobody drank with him.

There is no second glass in the sink, and the drying rack holds eight clean ones,
all dry.`,
      note: "Only one glass was used. Kadokura drank alone.",
    },
    bolt: {
      label: "The bolt",
      where: "on the inside of the door",
      reveals: `An iron bar, forearm-length, resting in a cast bracket. To close it you lift the bar
and let it drop. There is no slot, no gap, no string hole — the door is a single slab
of keyaki and sits flush in its frame.

The bar and bracket carry one clear set of fingerprints. They are Kadokura's.`,
      note: "The bolt can only be worked from inside. The only prints on it are Kadokura's own.",
    },
    ledger: {
      label: "The members' ledger",
      where: "by the stairs",
      reveals: `The Lantern Room is members-only; everyone signs in and out.

  22:10  R. Kadokura     in
  22:30  S. Torii        in
  23:15  S. Torii        out
  23:40  M. Onodera      in
  00:20  M. Onodera      out

Kadokura never signed out. Kuroda, as owner, does not sign at all.`,
      note: "Ledger: Torii 22:30-23:15, Onodera 23:40-00:20. Kadokura in at 22:10, never out.",
    },
    manuscript: {
      label: "The manuscript",
      where: "in a paper bag under the coat rack",
      reveals: `Four hundred pages, string-bound, corners soft from handling. The title page reads
"The Sound of the Weir", Sae Torii.

Clipped to the front is a slip in red pencil: RETURNED — NOT FOR US. The hand is
Kadokura's. The slip is dated eleven months ago.

The bag also holds a receipt from a courier office, dated today, for a package sent to
a different publisher.`,
      note: "Torii's manuscript was rejected eleven months ago — but today she couriered it elsewhere.",
    },
    photograph: {
      label: "The framed photograph",
      where: "on the shelf behind the counter",
      reveals: `A young woman in a summer dress on the steps of a public library, laughing at whoever
is holding the camera. The frame is cheap and the glass has been wiped so often the
print underneath has gone soft.

On the back, in pencil: natsu, 1996.`,
      note: "A photograph of a young woman, marked 'summer 1996', kept behind Kuroda's counter.",
    },
    clipping: {
      label: "The framed clipping",
      where: "in the stairwell, at eye level",
      reveals: `A newspaper page, thirty years yellow, framed the way a shop frames its first banknote.

  AKEBOSHI WEEKLY — 14 August 1996
  "THE LIBRARIAN WHO INVENTED A WAR"
  ... the documents Ms. K. presented to this magazine, and to the city, do not exist ...

The by-line is R. Kadokura.

A follow-up notice has been cut out and taped below it, four lines long, reporting that
the woman named in the article was found dead on 2 September 1996.`,
      note: "A 1996 article by Kadokura destroyed a woman's reputation; she died three weeks later. It hangs framed in this building.",
    },
    back_door: {
      label: "The back stair",
      where: "off the kitchen",
      reveals: `A service stair down to the alley. The door at the bottom is locked and the key hangs
on its hook in the kitchen, where it has left a clean mark on the paint.

Nobody has taken it down tonight. Nobody needed to: the stair comes up into the kitchen,
not the Lantern Room, and the Lantern Room door was bolted.`,
      note: "The back stair was unused, and it does not bypass the bolted door anyway.",
    },
  },

  /**
   * Interview lines. Some of these are lies. The page knows which; the agent
   * does not, and neither does the player until the reveal.
   */
  interviews: {
    torii: {
      victim: `"He read it. That's the part nobody believes. Eleven months, and he actually read it —
there were pencil marks all the way to page three hundred. Then 'not for us.'
I wanted to hear him say why. That's all I came for."`,
      alibi: `"I got here at half past ten, I left at quarter past eleven. Kuroda poured me one
barley tea because I don't drink, and he can tell you I never went behind the counter.
I was home by midnight. I live in Koenji, you can check the gate camera."`,
      bottle: `"That awful shochu? He kept it here so his wife wouldn't see how much he got through.
He offered me some. I said no. I don't drink, I told you."`,
      photograph: `"I've never looked at it properly. It's been up there as long as I've been coming."`,
      clipping: `"The clipping downstairs? Everyone who comes here reads it eventually. Kuroda says it's
the reason he opened the place — 'so there'd be one room where that man had to sit and
look at it.' I always thought it was a joke."`,
      manuscript: `"I couriered it to another house this morning. Yes, today. That's not a motive,
that's giving up. You don't kill a man eleven months after he says no, on the day
you finally stop caring what he thinks."`,
    },
    kuroda: {
      victim: `"Thirty years he sat on that stool. You don't do that with a man you can't stand."`,
      alibi: `"I closed the room at one and went down to do the books. He asked to stay — he did that
maybe six times a year, when he had a piece to think about. I left him the bottle and
went downstairs. I heard the bolt go over after me. That's the last thing I heard him do."`,
      bottle: `"His bottle, his cork, his business. I don't police what a man drinks."`,
      photograph: `"A cousin. She died a long time ago. I'd rather not."`,
      clipping: `"It's a famous piece. He was proud of it — used to say it was the only thing he wrote
that anyone remembered. I framed it for him."`,
      manuscript: `"The girl's book? He gave it back to her tonight. Whatever else he was, he did that
to her face, which is more than most of them manage."`,
    },
    onodera: {
      victim: `"He was the last of them. The kind who could end you in a sentence and then buy you
dinner. I'm not going to pretend I liked him."`,
      alibi: `"Twenty to twelve until twenty past. He signed the proof, he told me my margins were
sentimental, and I went home. Kuroda was here the whole time, wiping the same glass."`,
      bottle: `"He drank from it every time. Kuroda kept the shelf; nobody else touched those bottles.
That's the point of a keep bottle — it's yours."`,
      photograph: `"I asked about her once. Kuroda changed the subject so hard I never asked again.
Kadokura was standing right there and he didn't say anything either, which — for him —
was very unusual."`,
      clipping: `"That article is in our company history. It's on page nine of the anniversary book.
We tell it as the time we held the line against a hoax." She stops. "I've never checked
whether it was one."`,
      manuscript: `"He kept Torii's novel eleven months because he was going to take it. He told me in June.
Then in July he decided it was better than anything he'd written and he sent it back.
That's who he was."`,
    },
  },

  /** Fallback when an agent asks about a topic a suspect has nothing on. */
  no_comment: {
    torii: `"I don't know anything about that."`,
    kuroda: `"Couldn't tell you."`,
    onodera: `"You'd have to ask Kuroda."`,
  },

  /** Accusation vocabulary offered to the player and the agent. */
  options: {
    culprit: ["torii", "kuroda", "onodera", "nobody"],
    method: [
      { id: "forced_bolt", label: "The bolt was worked from the corridor with a tool" },
      { id: "hidden_exit", label: "There is a second way out of the room" },
      { id: "no_entry_needed", label: "The killer never had to be in the room at all" },
      { id: "accident", label: "No one killed him" },
    ],
    motive: [
      { id: "rejected_manuscript", label: "To settle the rejected manuscript" },
      { id: "career", label: "To take his position at the publisher" },
      { id: "old_death", label: "For a death in 1996" },
      { id: "none", label: "There was no motive" },
    ],
  },

  /** THE SOLUTION. Never leaves engine.js. */
  solution: {
    culprit: "kuroda",
    method: "no_entry_needed",
    motive: "old_death",
    epilogue: `The room was never sealed against anyone. Kadokura bolted the door himself, the way he did
six times a year when he wanted an hour alone with a piece he was thinking about. The bolt,
the flush door, the painted window — all of it is true, and none of it matters, because the
killer did not need to be in the room. He needed to be at the shelf, and he had been at that
shelf for thirty years.

The aconite went into the keep bottle. That is the new cork: Kuroda drew it, dosed it,
and pushed a fresh one home, and then he left the bottle for a man who poured his own drinks.
Whether Kadokura died at one o'clock or at four was never Kuroda's to decide, and he did not
care. There was only one glass on the counter because there was only ever going to be one.

The woman in the photograph was not a cousin. She was Kuroda's older sister — the librarian
of the 1996 article, who produced documents about a wartime requisition that Kadokura reported
did not exist. They did exist; they were in a prefectural annex that burned in 1998, and by
then she had been dead for two years.

Kuroda did not open the Lantern Room to forgive him. He framed the article in the stairwell
and put his sister on the shelf behind the counter, and for thirty years he poured a man his
drink under both of them, waiting to see whether he would ever once look up.`,
    near_miss: {
      culprit: `You have the right shape of the crime but the wrong hand behind it.`,
      method: `You have the right person. But ask yourself what the bolt actually proves — and who it
was keeping out.`,
      motive: `Right person, right method. The reason is older than anything that happened tonight.`,
    },
  },
};
