# SoloPlay Party Mode

Run several SoloPlay characters **in the same game, leveling together**. One profile is the **leader** (makes the games), the rest are **followers** (join the leader's game). In game they share one script list and fight side by side.

## How a game plays out

1. The host makes the game in the **lowest difficulty any online member still needs** - the host is the `Groups` leader, or whoever is furthest behind (see Host rotation). Everyone else joins it.
2. Everyone invites/accepts into the in-game party. The leader waits (up to `WaitForMembers`) until followers are in game, ready and partied.
3. The leader walks the normal SoloPlay script list. Before each script it asks every follower "do you still need this?"
   - **Both need it** (den, andariel...): the leader runs it, followers stick to the leader and **attack the leader's target**. Afterwards a follower that still needs the quest either just **talks to the NPC** for the reward (den, blood raven, tristram, radament, izual) or runs the script itself with the leader helping.
   - **Only a follower needs it**: that follower runs it, the leader follows and helps.
   - **Only the leader needs it**: the leader runs it, followers follow and help.
4. Everyone waits for each other before the next script. When nobody needs anything else, the leader ends the game.

### Moving as a group (meeting point)
Whoever is running the script - usually the leader, but a follower running its own quest works the same way - is the **runner**. Everyone helping it says so in its party file, so the runner always knows exactly who to wait for.

- **One meeting point.** D2 only lets you have one town portal, so the runner keeps one: it puts it down when it arrives somewhere by waypoint or portal and a helper isn't there. Walking through exits (Durance 3 -> 2 -> 3, Catacombs 2 -> 3 -> 4) doesn't replace it - helpers come through it and walk the rest of the way. A helper in town with no portal to where the runner is now takes the meeting-point portal and walks from there.
- **Planned waits only.** The runner waits (up to `GatherWait` seconds, `BossWait` in boss/quest areas like Den, Catacombs 4, Durance 3, Chaos) when it arrives by waypoint or portal, comes back from town, or walks into a boss area - fighting anything that comes close while it waits. Small catch-up pauses (`MaxWaitSeconds`) only happen right after it finishes a move, never while it's making or taking a portal or going to town.
- **Town trips.** When the runner pops to town in the middle of its script, helpers go to **its portal in the field** and wait there (clearing anything close) - even if they were somewhere else or in town - instead of following it into town and walking back - for up to `PortalHoldMinutes` (10), TownChicken trips included. The runner comes back **through its own portal**, lands next to them, and if anyone is still in town (going back through your own portal closes it) puts a new one down and waits.
- **Battle Orders.** Every regroup, whoever has Battle Orders casts it once everyone is together, and the runner waits until everyone has the buff.
- Followers in the wrong act's town switch to the act the portal leads to - a portal only shows up in the town of the act it opens into.
- The runner keeps its last 4 town portals for its own town trips. If anyone does run out, it takes a party member's portal, the waypoint, or walks back to town instead of quitting the game.

### Host rotation
Whoever is **furthest behind** (difficulty first, then act, then level) makes the games and runs the plan; everyone else joins and helps them catch up. On a tie the leader from `Groups` hosts. So when the leader finishes Normal (kills Baal) and a follower is still in act 3, the follower hosts Normal games until it catches up, and the rest join it.

This also fixes quests that only work in a game made by someone who hasn't done them yet - like **Khalim's Will**, where the Compelling Orb is already broken in a game made by someone who finished it. Turn it off with `HostRotation: false` (the `Groups` leader always hosts).

### Taxi
A follower that can **teleport** (a sorc) is the party's taxi. At the start of each quest whose area has no waypoint (Catacombs 4, Radament's sewers, Durance 3, Chaos Sanctuary, Throne...), it teleports there, opens a town portal and comes back through it. Everyone else waits in town (up to `TaxiWait` seconds) and takes that portal instead of walking. If the taxi can't make it, they carry on like normal.

### Catch-up mode
With host rotation the furthest-behind member hosts, so this is only needed when a follower is stuck on a quest but isn't the one furthest behind. When a follower fails the same quest in `CatchUpAfterFails` party games in a row, it switches to **catch-up mode**: it makes its own games and plays normal solo SoloPlay until those quests are done, then rejoins the party. The leader doesn't wait for it meanwhile and keeps making games in the difficulty it needs. After `MaxCatchUpGames` solo games it rejoins anyway.

Progress is kept in `.soloplay/party/<profile>.stuck.json` (delete it to cancel catch-up).

## Install

1. Copy this folder over `d2bs/kolbot/libs/SoloPlay/`.
2. Copy `+setup/PartySettings.js` to `Settings/PartySettings.js` and edit it:
   ```js
   Enabled: true,
   Groups: {
     "SCL-PAL": ["SCL-SORC"],   // leader: [followers]
   },
   ```
   **Make the tankiest character the leader** - it walks into every fight first.
3. D2BotNG profiles (all on the same PC):
   - Entry script: `D2BotSoloPlay.dbj` for **every** member (not D2BotFollow.dbj)
   - Normal SoloPlay profile names (`SCL-PAL`, `SCL-SORC`...) with the **same prefix**, same realm, each with its own key list
4. Start the **followers first** (status: "Party :: Waiting for leader..."), then the leader.

> If you run D2BotNG from a copied folder, check `d2botng.json` (`basePath`) and `data/ng/frameworks.json` (`d2bsPath`) point at that folder, and that `d2bs/d2bs.ini` has a section for each profile - otherwise the game loads scripts from a different copy.

## Settings (`Settings/PartySettings.js`)

| Setting | Default | What it does |
|---|---|---|
| `Enabled` | false | Master switch. Off = every profile plays solo |
| `Groups` | | `"leader": ["follower", ...]` using profile names |
| `WaitForMembers` | 120 | Seconds the leader waits at game start for online followers |
| `PlanTimeout` | 30 | Seconds the leader waits for followers to say what they need |
| `SyncTimeout` | 15 | Minutes the party waits on a slow member before moving on |
| `LeaderLostTimeout` | 10 | Seconds before followers leave after the leader disappears |
| `StaleAfter` | 300 | Seconds before a silent member counts as offline |
| `SyncDifficulty` | true | Make games in the lowest difficulty any member needs |
| `LeaderLedScripts` | true | Shared scripts: follower fights alongside the leader instead of running its own copy |
| `FollowDistance` | 7 | Helpers move back to who they follow past this many yards |
| `AssistRange` | 12 | With no shared target, helpers only clear this close |
| `LeaderPortals` | true | Leader drops portals in new areas for followers |
| `LeaderWaits` | true | Leader pauses when a follower falls behind |
| `WaitDistance` | 25 | Yards back that counts as "behind" |
| `MaxWaitSeconds` | 8 | Longest catch-up pause (only right after a move) |
| `HostRotation` | true | Furthest-behind member hosts the games, everyone joins to catch it up |
| `HoldAtPortal` | true | Followers wait at the leader's portal while it's in town; leader returns through it |
| `PortalHoldMinutes` | 10 | How long followers keep waiting at that portal (town trips and TownChicken) before going to find the leader |
| `GatherWait` | 30 | Seconds the runner waits for its helpers (and BO) when it arrives by waypoint/portal or comes back from town (0 = off) |
| `BossWait` | 45 | Same, when it walks into a boss / quest area |
| `BattleOrders` | true | Party member with BO buffs everyone at each regroup |
| `Taxi` | true | A teleporting follower opens portals to quest areas for everyone |
| `TaxiWait` | 90 | Seconds the others wait in town for the taxi's portal |
| `CatchUpAfterFails` | 2 | Failed party games on the same quest before a follower goes solo to catch up |
| `MaxCatchUpGames` | 6 | Most solo catch-up games before rejoining anyway |
| `MaxGameMinutes` | 150 | Hard cap on a party game |
| `Debug` | false | Print every party step to the D2BotNG console |

## What you'll see

Console (with `Debug: true`):
```
[Party] Party mode ON - role: follower | host: scl-barb | configured leader: scl-pal | members: scl-pal, scl-sorc, scl-barb | host rotation on (furthest behind hosts)
[Party] This game's host: scl-barb (furthest behind)
[Party] Partied with leader scl-pal
[Party] Starting with scl-sorc (expected: scl-sorc) | in party: scl-sorc
[Party] Step 1: den | running: scl-pal, scl-sorc
[Party] Portal down in Cold Plains for scl-sorc
[Party] MySorc collected den reward from akara
[Party] Leader left the game - leaving and waiting for the next one
[Party] MySorc teleporting ahead to Catacombs Level 4 for andariel
[Party] Taxi portal is open to Catacombs Level 4
[Party] MyPal took MySorc's portal to Catacombs Level 4
[Party] MyBarb failed travincal in a party game (2/2)
[Party] scl-barb is playing solo to catch up on: travincal
[Party] MyBarb is caught up - rejoining the party next game
```
Overhead: `Party: holding at <leader>'s portal`, `Party: regrouping for Battle Orders`, `Party: Battle Orders!`, `Party: waiting for scl-sorc`, `Party: going to <name> (<area>)`, `Party: looking for <name>'s portal`.

## Debugging

Live state is in `.soloplay/party/` (delete any time to reset):
- `<profile>.oog.json` - status, game it's in, difficulty it wants
- `<profile>.stuck.json` - quests a follower keeps failing in party games (catch-up mode)
- `<profile>.game.json` - area/position, current target, and the party fields: `step`, `phase`, `script`, `needers` (leader) or `needsStep`, `needs`, `doneStep`, `running` (followers)

## Files changed vs. stock SoloPlay

| File | Change |
|---|---|
| `Modules/Party.js` | New - all party logic |
| `+setup/PartySettings.js` | New - settings template |
| `OOG/SoloEntry.js`, `OOG/OOGOverrides.js` | Followers join instead of create; leader picks party difficulty; party heartbeat |
| `Core/LoaderOverrides.js` | `Loader.run` split into `Loader.runIndexedScript` so one script can run on its own (solo unchanged) |
| `SoloPlay.js` | Uses the party loop when enabled; fixes the `SimpleParty` require path (`../modules/workers/SimpleParty`) |
