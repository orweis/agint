# The agents map

The map is AGINT's intelligence picture: every agent that reports, who it works for, what it reaches,
and what it saw from where it runs that nobody has connected yet. This document is the plan for the
experience. Each section ends in a decision; **v1** is built now, **later** is not.

Code: `src/lib/map-*.ts` (pure logic, tested in `tests/map.test.ts`), `src/components/map/**` (client
components), `src/lib/fixtures/northstar-map.ts` (the demo story), `/preview/map` (unauthenticated preview).

## 1. Who looks at it, and the questions it answers

The reader is a security lead or platform owner. They did not deploy most of these agents and cannot
list them. The map answers five questions, in this order of prominence:

| Question | Where the answer is |
| --- | --- |
| Who are my agents? | The centre column: every source, with harness and last report. |
| Who do they work for? | Each source hangs under its principal. An agent with no principal hangs under "No principal". |
| What can they reach? | The left column: repositories, services, data stores, credentials, hosts, jobs each source uses. |
| What did they see that nobody connected? | The right column: unissued keys, unknown agents, unapproved MCP servers, mentions. |
| Where is shadow AI? | The Exposure lens and the "Needs a person" list, sorted by signal. |

A sixth, quieter job: **show the network compounding.** One source gives a thin picture; each new source
widens it and overlaps start to corroborate. Replay makes that visible.

Three rules from the product shape every decision below:

1. **A lead is never a fact.** Nothing a single reporter saw is drawn as solid. The dash is the claim.
2. **The picture is never complete.** Every count shows what it was built from. "Unknown" is drawn as a
   value, not hidden as a gap.
3. **Calm over dramatic.** The vocabulary is intelligence (sources, leads, corroborate, trace, picture).
   No missions, perimeters, threats or radar sweeps. Red appears only on a key that should not be visible.

## 2. Visual grammar

Three independent channels, so nothing depends on colour alone.

**Shape and icon say what it is (kind).**

| Kind | Shape | Icon |
| --- | --- | --- |
| Agent | Circle (large) | Bot |
| Person | Circle (small) | User |
| Credential | Diamond | Key |
| Host, MCP server, tool, repository, service, data store, resource, job | Rounded square | One per kind |

**Outline says how much we believe it (state).** Labels come from `ENTITY_STATE_META`.

| State | Outline | Extra mark |
| --- | --- | --- |
| Source | Solid, filled | none; a quiet source is hollow and its subtitle says "Quiet 26h" |
| Lead | **Dashed** | none |
| Corroborated | **Solid, heavier** | a "×2" reporter count |
| Traced | Solid | a check mark |
| Reference | **Dotted**, no fill, italic label | none; excluded from every count |
| Dismissed | Solid faint, label struck through | hidden unless asked for |

**Hue says what role it plays in the picture.**

| Role | Hue | Meaning |
| --- | --- | --- |
| Source | Violet (`source`) | An agent that connected and reports its own view. |
| Principal | Teal (`person`) | A person an agent says it works for. |
| Reach | Slate (`thing`) | Something a source uses: in its reach by its own report. |
| Seen, not connected | Ember (`lead`) | Something a source noticed that is not its own, or anything carrying a signal. |
| Traced | Green (`good`) | A person confirmed it. |

Decision: **a repository a source reads is a lead by state (one reporter) but is not painted ember.** It
is slate and dashed. Ember is reserved for what was sighted from outside (an unknown agent, a key not
issued to the reporter, an MCP server nobody approved) so that the eye lands on the four things that
need a person, not on thirty routine dependencies. The dash still tells the truth about every one of them.

**How a source differs from an unknown agent.** Same shape (circle with the bot icon). The source is
filled violet, sits in the centre column under its principal, and has a subtitle with its harness. The
unknown agent is hollow, ember, dashed, sits in the right column, and its subtitle says "Unknown agent".
A mentioned agent is dotted and grey. Three treatments differing in fill, dash and position.

**Signal badge.** A node with signals carries a small "!" disc at its top right: red for danger-toned
signals (`unissued_credential`, `shared_credential`), ember for the rest. The dossier names each signal.

**Edges.** Classified by `edgeClass` in `lib/map-model.ts`.

| Class | Relations | Stroke |
| --- | --- | --- |
| Context | `works_for`, `runs_on` | Thin, faint, solid. `works_for` is drawn as a tree bracket from the principal. |
| Reach | `uses`, `holds`, `reads`, `writes`, `executes`, `calls`, `deploys` | Thin slate, solid. |
| Sighting | `sees`, and any claim about an agent that is not a source | Ember, dashed, arrowhead. |
| Agent to agent | `delegates_to`, `spawned`, `shares_job` between agents | Violet, solid, heavier, arrowhead. |
| Mention | Any edge touching a reference | Faint, dotted. |
| Overlap (Agents lens only) | Derived: two agents share a host, job, repository, server | Violet, dotted, labelled "via …". |

An edge reported by two agents is drawn heavier. Relation names appear only on the focused node's edges;
at rest, the class is enough.

## 3. Layout

Decision: **a structured picture, not a free hairball.** Three regions, read from the centre out:

```
        REACH                    SOURCES                 SEEN, NOT CONNECTED
  what they use                who works for whom        what they noticed
                                 ○ Maya Chen
  ▢ northstar/web  ──────────┬─ ● release-assistant ─ ─ ─ ◇ OPENAI_API_KEY   !
  ▢ web-ci         ──────────┤                      ─ ─ ─ ○ billing-helper   !
  ▢ maya-mbp       ──────────┴─ ● maya-cursor       ─ ─ ─ ▢ notes-sync  ×2   !   ┄┄ ▢ CRM exports
```

- **Centre (spine):** principals with their sources hanging beneath, tree-style. Groups are ordered by
  when their first source connected, so a new principal appends at the bottom and nothing above moves.
- **Left:** each source's reach, ordered so a source's things sit beside it.
- **Right:** what sources saw but do not own. A near column for things a source saw directly; a far
  column for hearsay one hop out (what a mentioned agent is said to reach).

Why sides rather than a left-to-right chain: with reach and sightings on opposite sides of the sources,
no edge has to cross a column of unrelated nodes to reach its target. The frontier also has a direction:
the picture widens to the right.

**Determinism.** `layoutPicture` sorts its input by id, places the spine by rule, seeds each side column
by the barycentre of its neighbours, then runs `d3-force` synchronously for a fixed 240 ticks with x
pinned to the column and a seeded random source, and finishes with a strict spacing pass. The same map
gives the same coordinates on the server and in the browser (no hydration drift), and positions are
rounded to tenths.

**Stability.** The layout is computed from the whole lens view, never from the filtered or replayed
subset. Filtering, searching and scrubbing time only hide or dim nodes; nothing jumps.

**Agents lens** uses a different, free layout (`layoutFree`): seeded on a spiral, `d3-force` with links,
charge and box collision for 300 ticks. Agent-to-agent graphs are small and have no natural columns.

- v1: structured layout, two staggered sub-columns on the left past 10 nodes, free layout for Agents.
  A small graph is never magnified past life size; it is framed instead.
- Later: swimlanes per principal or per host drawn in one picture; a vertical orientation for narrow
  screens; incremental layout that pins existing nodes when live reports arrive.

## 4. Lenses, filters, search

A lens chooses the question; filters narrow within it. Lenses are tabs (`LENSES` in `lib/map-lens.ts`).

| Lens | Shows | Question |
| --- | --- | --- |
| **Picture** | Everything except dismissed. | What do we know? |
| **Agents** | Agents only, with direct links and derived overlaps (shared host, job, repository, server, principal). | Which agents touch each other? |
| **Reach** | Principals, sources and what sources use. No sightings. | What can my agents get to? |
| **Exposure** | Sightings and flagged nodes with the sources that reported them. | What needs a person? |
| **By principal** | One person's sources, their reach and what they saw. A picker chooses the person. | What is running in Maya's name? |

Filters (a panel under the tabs): kinds, states, signals. Empty means all. Dismissed nodes are hidden
unless the Dismissed state is ticked. Filters **hide**. Search (label, ref, kind, harness, principal,
attribute values) **dims** everything that does not match and counts the matches, because the reader
usually wants the match in context. Counters never change with lens, filter or search: they describe
the network, not the view.

- v1: all five lenses, three filter groups, search.
- Later: saved views, URL-held lens and filters (`?lens=exposure`), a host picker like the principal one.

## 5. Focus and the dossier

Click (or Enter on) a node to focus it. The rest of the map dims to a fifth; the node, its one-hop
neighbours and the edges between them stay lit, and those edges gain their relation labels. Click the
background or press Escape to release. Hovering previews the same dimming without opening anything.

The side panel becomes the node's **dossier**:

1. **Identity:** glyph, label, kind, ref in monospace.
2. **State, with its meaning:** the chip and the sentence from `ENTITY_STATE_META`, so "Lead" always
   reads "One reporter saw it. A lead, never a fact."
3. **Signals,** each with its description.
4. **Source profile** (sources only): principal, task, harness and model, runtime and host, first and
   last report, report count. Missing values read "Unknown", never blank.
5. **Reported by:** each reporting source, when it first and last reported this, and how many reports.
6. **Seen or used:** how many agents used it (a reach relation of their own, or a sighting on the basis
   `accessed`), how many saw it running or configured, and how many only mentioned it, from each edge's
   `bases`. "Configured is not accessed" is said in words.
7. **Connections:** every edge as a sentence ("release-assistant sees notes-sync"), with reporters, count,
   last time, and the latest reported summaries. Each neighbour is a button that moves the focus.
8. **What would move it on:** the three ways out of a lead (connect it, a second source reports it, a
   person traces or dismisses it), filtered to what applies to this state and kind (`nextSteps`).
9. **Open full dossier** links to `/n/[slug]/e/[id]`, where the actions live.

With nothing focused the panel is the **briefing**: "Needs a person" (open findings ordered by signal
severity), then sources with their last report, then what is not counted and why.

- v1: all of the above, read-only. Trace, dismiss and connect are on the full page.
- Later: multi-select, path between two nodes, two-hop expansion, inline trace and dismiss.

## 6. Time replay

A bar under the canvas: play or pause, a scrubber, the moment's date and a caption.

Decision: **the scrubber steps through moments, not seconds.** `moments()` lists each distinct time
something first appeared, so every step changes the picture. Each moment has a caption built from what
happened: "release-assistant connected", "notes-sync corroborated by support-summarizer", "+ OPENAI_API_KEY".
Counters follow the scrubber, so Sources and Mapped climb as the network grows.

`replayAt()` builds on `mapAt()` and also rewinds what can be derived: an agent seen before it connected
is drawn as a lead until its `source.firstSeenAt`; a corroborated node is a lead until its second
reporter's first edge. That is how replay shows a lead becoming a source and a lead being corroborated.
Traced and dismissed cannot be rewound (the read model has no time for them); they show as today's.

Nodes that arrive in the current moment pulse once. Play advances one moment every 900 ms and stops at
the present. "Live" returns to now.

- v1: moments, captions, play, derived state rewind.
- Later: a sparkline of Mapped over time behind the scrubber; exact trace and dismiss times; speed control.

## 7. Counters

`Sources N · Leads N · Corroborated N · Mapped N`, always visible, computed by `countMap`.

- **Sources:** agents that connected. Shown with its denominator: "4 of 5 agents seen".
- **Leads:** nodes in state lead. **Corroborated:** nodes in state corroborated.
- **Mapped:** every node somebody saw: sources, leads, corroborated and traced. References and dismissed
  nodes are excluded, and the line beneath says how many.
- The line beneath also carries the honest denominator: "Built from 87 reports by 4 sources. Not a
  complete inventory." and "1 source quiet" when one has stopped reporting.

Decision: never show a percentage of "coverage". There is no known total to divide by; the only honest
ratio is sources over agents seen.

## 8. Empty state and first run

- **No sources:** no canvas. One sentence to give an agent, with a copy button: "Connect to the AGINT
  MCP at `<origin>/mcp` and report as you work." Below it, three lines on what happens next (it becomes
  a source; what it sees arrives as leads; a second source corroborates).
- **One source:** the map draws normally. The briefing says "One source so far. Every source widens the
  picture."
- **Replay as the story:** "Watch it grow" in the counters bar starts replay from the first moment. For
  the demo this is the opening move: one violet dot, its reach, its leads, then the second source lands.

- v1: empty state, one-source hint, replay from start.
- Later: a guided first-run that narrates the first three moments as they happen live.

## 9. Scale

The structured layout stays legible to about 150 nodes. Past that the leaves are the problem: one agent
reading 80 files.

- **v1: `collapseLeaves`.** Above 120 nodes, a source's exclusive leaf things (one neighbour, no signals,
  not an agent, person or credential) are grouped by kind into one aggregate node ("14 resources") when
  there are 3 or more. An aggregate is drawn as a stacked square with its count. Its dossier lists the
  members; "Show all" expands that group in place. Anything with a signal, anything shared, and every
  agent, person and credential always stays individual.
- **v1:** the left column splits into two staggered sub-columns past 10 nodes.
- Later (300+ sources): collapse a principal's whole group into one node until opened; canvas or WebGL
  rendering; viewport culling; server-side lens queries so the client never holds the full graph.

## 10. Accessibility

- **Text equivalent.** "Table" swaps the canvas for two tables built by `nodeRows` and `edgeRows`: every
  node (name, kind, state, signals, reporters, first and last seen) and every edge as a sentence with its
  reporters. The tables follow the current lens, filters and replay moment, the same as the picture.
- **Keyboard.** The canvas is one tab stop (roving tabindex). Arrow keys move to the nearest node in that
  direction (`nearestInDirection`), Enter or Space focuses it, Escape releases. Each node is a button
  whose name reads "notes-sync, MCP server, Corroborated, Shadow MCP, seen by 2 sources". The view pans to
  keep the focused node visible. `+`, `-` and `0` zoom and fit.
- **Never colour alone.** State is dash pattern plus a mark; kind is shape plus icon; role is position
  plus hue; signals are a badge with "!"; selection is a ring plus `aria-pressed`.
- **Contrast.** Text uses the `-ink` tokens on tints; labels on the canvas have a canvas-coloured halo so
  an edge never runs through a word.
- **Reduced motion.** The global rule collapses transitions. Replay still steps, without the pulse, and
  zoom buttons jump instead of easing.

## 11. Mobile (375px)

List first, map below. The order is counters, lens tabs (scrolling horizontally), the briefing or
dossier, then the canvas at a fixed height as an overview, then replay. Tapping a list row focuses the
node on the map; tapping a node on the map brings its dossier into view. One finger scrolls the page
past the map; a horizontal drag pans; the buttons zoom.

- v1: the stacking above.
- Later: a vertical layout for the canvas, and a bottom sheet for the dossier.

## 12. Interaction details

- Pan by dragging; zoom with the buttons, `+` and `-`, a pinch, or Ctrl/⌘ + scroll. Plain scroll is left
  to the page so the map never traps it. Double-click zooms in. "Fit" returns to the whole picture.
- A one-line legend sits under the canvas (it scrolls sideways on a narrow screen); each entry's tooltip
  gives the state's meaning.
- All times are UTC and relative times are measured from the map's `generatedAt`, not from the browser
  clock, so the server and the client render the same words.

## 13. What the server must provide

The component takes `{ map, slug }` and nothing else. From the read model it relies on:

- `MapNode.source.agentId` matching the ids in `MapEdge.reporterIds` (that is how reporters are named).
- `MapNode.firstSeenAt` being the first sighting, and `source.firstSeenAt` the time it connected, so
  replay can show a lead becoming a source.
- `works_for` edges from agent to person, `runs_on` from agent to host.
- `MapEdge.bases` on sightings (strongest first). A sighting whose strongest basis is `mentioned` is
  drawn as a mention and never counts as a reporter; `accessed` counts as used; `running` and
  `configured` count as seen. Empty means the agent's own activity.
- Optional node attributes shown as facts when present: `location`, `url`, `harness`, `host`.
- Signals already derived on each node.

Later, additive: `tracedAt` / `dismissedAt` for replay.
