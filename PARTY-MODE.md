# SoloPlay Party Mode

Run several SoloPlay characters **in the same game, leveling together**. One profile is the **leader** (makes the games), the rest are **followers** (join the leader's game). In game they share one script list and fight side by side.

## How a game plays out

1. The leader makes the game in the **lowest difficulty any online member still needs**. Followers join it.
2. Everyone invites/accepts into the in-game party. The leader waits (up to `WaitForMembers`) until followers are in game, ready and partied.
3. The leader walks the normal SoloPlay script list. Before each script it asks every follower "do you still need this?"
   - **Both need it** (den, andariel...): the leader runs it, followers stick to the leader and **attack the leader's target**. Afterwards a follower that still needs the quest either just **talks to the NPC** for the reward (den, blood raven, tristram, radament, izual) or runs the script itself with the leader helping.
   - **Only a follower needs it**: that follower runs it, the leader follows and helps.
   - **Only the leader needs it**: the leader runs it, followers follow and help.
4. Everyone waits for each other before the next script. When nobody needs anything else, the leader ends the game.

While the leader is running a script it:
- drops a **town portal** when it arrives somewhere a follower isn't, so followers without that waypoint can come through it,
- **holds still** (up to `MaxWaitSeconds`) when a follower falls behind - never with monsters close.

If the **leader leaves** (chicken, death, crash), followers leave within `LeaderLostTimeout` seconds and wait at the join screen for the leader's next game. If a **follower** chickens, it rejoins the leader's game and picks up where the party is.

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
| `WaitForMembers` | 90 | Seconds the leader waits at game start for online followers |
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
| `MaxWaitSeconds` | 8 | Longest single pause |
| `MaxGameMinutes` | 150 | Hard cap on a party game |
| `Debug` | false | Print every party step to the D2BotNG console |

## What you'll see

Console (with `Debug: true`):
```
[Party] Party mode ON - role: follower | leader: scl-pal | followers: scl-sorc
[Party] Partied with leader scl-pal
[Party] Starting with scl-sorc (expected: scl-sorc) | in party: scl-sorc
[Party] Step 1: den | running: scl-pal, scl-sorc
[Party] Portal down in Cold Plains for scl-sorc
[Party] MySorc collected den reward from akara
[Party] Leader left the game - leaving and waiting for the next one
```
Overhead: `Party: waiting for scl-sorc`, `Party: going to <name> (<area>)`, `Party: looking for <name>'s portal`.

## Debugging

Live state is in `.soloplay/party/` (delete any time to reset):
- `<profile>.oog.json` - status, game it's in, difficulty it wants
- `<profile>.game.json` - area/position, current target, and the party fields: `step`, `phase`, `script`, `needers` (leader) or `needsStep`, `needs`, `doneStep`, `running` (followers)

## Files changed vs. stock SoloPlay

| File | Change |
|---|---|
| `Modules/Party.js` | New - all party logic |
| `+setup/PartySettings.js` | New - settings template |
| `OOG/SoloEntry.js`, `OOG/OOGOverrides.js` | Followers join instead of create; leader picks party difficulty; party heartbeat |
| `Core/LoaderOverrides.js` | `Loader.run` split into `Loader.runIndexedScript` so one script can run on its own (solo unchanged) |
| `SoloPlay.js` | Uses the party loop when enabled; fixes the `SimpleParty` require path (`../modules/workers/SimpleParty`) |
