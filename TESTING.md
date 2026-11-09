# Testing Party Mode (beta)

Thanks for helping test! Party mode lets several **Kolbot-SoloPlay** characters play **in the same game** and level together: one leader makes the games, the others join, they share one quest list, fight the same monsters and wait for each other. Full details are in [PARTY-MODE.md](PARTY-MODE.md).

## What you need

- **Diablo II + LoD 1.14d** (English) and one CD key per character.
- All party characters on the **same PC**, same realm.
- Full setup: nothing else - D2BotNG is included. Drop-in: a D2BotNG + kolbot + Kolbot-SoloPlay install that already runs SoloPlay solo.

## Two downloads - pick one

| Download | For |
|---|---|
| **`SoloPlay-PartyMode-FullSetup-*.zip`** | Starting fresh. Everything in one folder: D2BotNG, kolbot + D2BS, SoloPlay party mode, and 4 party profiles (Pal leader, Sorc, Barb, Necro) ready to go - add your CD keys and press start. Follow `START-HERE.md` inside. |
| **`SoloPlay-PartyMode-DropIn-*.zip`** | You already run SoloPlay with D2BotNG. Just the `libs\SoloPlay` folder. |

## Install the drop-in (about 5 minutes)

1. **Close D2BotNG** and stop all bots.
2. **Back up** your current `d2bs\kolbot\libs\SoloPlay` folder (zip it or copy it somewhere).
3. Extract the drop-in zip into your **D2BotNG folder** (the one with `D2BotNG.exe` and `d2bs`). It only contains `d2bs\kolbot\libs\SoloPlay\...`, so it drops straight into place. Say **yes** to replacing files.
   - Your own `Settings\Settings.js`, `Settings\AdvancedSettings.js`, `OOG\StarterConfig.js`, character data and logins are **not** in the zip, so they are kept.
   - Never ran kolbot's `setup.bat`? Those three files are created for you from the `+setup` templates the first time a profile starts. If kolbot itself then complains about other missing config files, run `setup.bat` in your kolbot folder once.
4. Open `d2bs\kolbot\libs\SoloPlay\Settings\PartySettings.js` and set your group. Use your **D2BotNG profile names**:
   ```js
   Enabled: true,
   Groups: {
     "SCL-PAL": ["SCL-SORC", "SCL-BARB"],   // leader: [followers]
   },
   ```
   **Make the tankiest character the leader** - it walks into every fight first. Leave `Debug: true` while testing.
5. D2BotNG profiles, for **every** member:
   - Entry script: `D2BotSoloPlay.dbj` (not D2BotFollow / D2BotLead).
   - Normal SoloPlay profile names with the **same prefix** (`SCL-PAL`, `SCL-SORC`, `SCL-BARB`...).
6. Start the **followers first** (status shows `Party :: Waiting for leader...`), then the leader.

> Running D2BotNG from a copied folder? Check `d2botng.json` (`basePath`) and `data\ng\frameworks.json` (`d2bsPath`) point at **that** folder, and that `d2bs\d2bs.ini` has a section for each profile. Otherwise the game loads scripts from a different copy and party mode never turns on.

## What to watch

| When | You should see |
|---|---|
| Game start | Leader waits in town: `Party: waiting for scl-sorc, scl-barb (95s)` until everyone is in and partied |
| Leader takes a waypoint | It drops a town portal and waits: `Party: waiting for ...`. Followers come through the portal |
| Boss / quest area (Den, Cata 4, Durance 3, Chaos...) | Leader waits up to 45s for everyone before the fight |
| Leader pops to town mid-quest | Followers go to its portal in the field: `Party: holding at <leader>'s portal` |
| Barb in the party | `Party: Battle Orders!` when everyone is together |
| Leader chickens / leaves | Followers leave within 10s and wait for the next game |
| Someone falls behind on quests | Next game the one furthest behind hosts and the others help it catch up |

## What to report

Open an issue (or post in the thread) with:

1. **What happened** and roughly **when** (time on your PC clock).
2. Your **group**: how many characters, which classes, which is the leader, what act/difficulty.
3. **The logs zip** - double-click **`Collect Logs.bat`** in your D2BotNG folder (or `d2bs\kolbot\libs\SoloPlay\Tools\CollectLogs\Collect Logs.bat`). It makes `PartyMode-Logs-<date>.zip` on your Desktop with the last 2 days of:
   - `d2bs\logs\d2bs-<profile>-<date>.log` - the main log of every bot (search for `[Party]`)
   - `d2bs\kolbot\logs\ScriptErrorLog.txt` and `chicken-*.log` - crashes and low-life exits
   - `libs\SoloPlay\.soloplay\party\*.json` - live party state (who hosts, who's where)
   - `libs\SoloPlay\.soloplay\<profile>\*Performance.csv` - levels and scripts over time
   - `libs\SoloPlay\Settings\PartySettings.js` - your party setup
   - D2BotNG's own `logs\d2bot-*.log`, plus `info.txt` (versions and profile names/scripts)

   Account names, passwords, CD keys, proxy logins, game passwords, IP addresses and your Windows user name are **taken out** of every file before it's zipped. Character names stay in (the logs are useless without them) - look the zip over before posting it publicly.

   Older problem? Run it with more days: `powershell -ExecutionPolicy Bypass -File CollectLogs.ps1 -Days 5`.

## Known limits (beta)

- All party members must run on the **same PC** (they talk through files).
- Built and tested on the SoloPlay version it's based on - mixing with a much newer/older SoloPlay may break things.
- Some quests can't be done in someone else's game once they've finished them (e.g. Khalim's Will). Host rotation handles that by letting the one that's behind host.
- To go back to normal SoloPlay: set `Enabled: false` in `PartySettings.js`, or restore your backup.
