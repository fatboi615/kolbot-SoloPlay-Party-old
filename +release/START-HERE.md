# SoloPlay Party Mode - Complete Setup

Everything you need to run **4 SoloPlay characters in the same game, leveling together** - the manager, the bot and party mode, all in this folder:

| Profile | Class (build) | Role |
|---|---|---|
| `SCL-PAL` | Paladin (Hammerdin) | **Leader** - walks in first |
| `SCL-SORC` | Sorceress (Lightning) | Teleports ahead and opens portals ("taxi"), rushes new characters |
| `SCL-BARB` | Barbarian (Whirlwind) | Battle Orders for the party |
| `SCL-NECRO` | Necromancer (Summon) | Follower |

Included: **D2BotNG** (the manager), **kolbot** + **D2BS**, **Kolbot-SoloPlay with party mode**, the four profiles above set up as one party, and two helpers - **Arrange Bots** and **Bot Viewer**. No accounts, CD keys or proxies are included - you add your own CD keys.

## You need

- **Diablo II + Lord of Destruction 1.14d** installed (English).
- **4 CD keys** (classic + expansion) - one per character, every running game needs its own.
- Windows 10/11.

## Setup (about 10 minutes)

### 1. Unzip
Unzip this folder somewhere simple, e.g. `C:\D2BotNG-PartyMode\`. Avoid `Program Files` and OneDrive folders.

### 2. First run
Double-click **`D2BotNG.exe`**. It finds your Diablo II install and uses the `d2bs` folder next to it automatically. You'll see the four profiles in the **Party** group.

> If your Diablo II isn't in `C:\Program Files (x86)\Diablo II\`, open each profile and set its game path to your `Game.exe`, and fix the game folder under **Frameworks > Default**.

### 3. CD keys
**Keys** tab > add a key list for each character (for example `pal`, `sorc`, `barb`, `necro`) with that character's classic + expansion key. Then open each profile and pick its **Key list**.

### 4. Realm
The profiles use **US East**. Want another realm? Change **Realm** on all four - they must all be on the same one.

### 5. Start
1. Start **SCL-SORC**, **SCL-BARB** and **SCL-NECRO** first. Their status shows `Party :: Waiting for leader...`
2. Then start **SCL-PAL**.

SoloPlay makes the accounts and characters by itself the first time - leave **Account / Password / Character** blank.

## What you'll see

- Whoever is furthest behind makes the game and everyone else joins it and helps, so nobody gets left behind.
- The game maker waits in town until everyone is in the game and in the party (up to 2 minutes).
- At each waypoint it drops a **town portal** and waits for everyone: `Party: waiting for scl-sorc, scl-barb`.
- Before boss fights (Den, Andariel, Duriel, Mephisto...) it waits up to 45 seconds for the whole party.
- The sorc teleports ahead to areas with no waypoint and opens a portal for everyone.
- The barb casts **Battle Orders** whenever the party regroups.
- A brand new character in a party that's already ahead gets **rushed** by the sorc through the act bosses to catch up.
- If the game maker leaves (chicken / death), the others leave too and wait for its next game.

## Watching them

- **`Arrange Bots.bat`** - makes the game windows smaller (640x480) and lines them up side by side so none overlap, and keeps them lined up when a bot restarts. Restart the bots once for the new size.
- **`d2bs\kolbot\libs\SoloPlay\Tools\BotViewer\Bot Viewer.bat`** - optional: one window with a live picture of every game. Click a picture (or press 1-9) to jump to that game.

## Changing the party

Edit `d2bs\kolbot\libs\SoloPlay\Settings\PartySettings.js`:

```js
Groups: {
  "SCL-PAL": ["SCL-SORC", "SCL-BARB", "SCL-NECRO"],   // leader: [followers]
},
```

- Use **profile names** exactly as they are in D2BotNG.
- All members need the **same prefix** (`SCL-`, `HCL-`...) and the entry script `D2BotSoloPlay.dbj`.
- 2 to 8 characters, all on this PC. Running fewer? Just don't start the others - nobody waits for a profile that isn't running.
- Want to play solo again? Set `Enabled: false`.

Every setting is explained in that file and in [PARTY-MODE.md](d2bs/kolbot/libs/SoloPlay/PARTY-MODE.md).

## Problems?

- **Follower makes its own game / never waits for the leader** - check the profile names match `Groups` exactly and every profile uses `D2BotSoloPlay.dbj`.
- **"Profile ... not found" in the game window** - save the profile once in D2BotNG (it rewrites `d2bs\d2bs.ini`).
- **Report a bug** - see [TESTING.md](d2bs/kolbot/libs/SoloPlay/TESTING.md) for what logs to send. Remove account names, passwords and keys before posting logs.

## Credits

This package puts together open source work by:

- [D2BotNG](https://github.com/ResurrectedTrader/D2BotNG) - ResurrectedTrader (this build adds richer Discord notifications)
- [kolbot](https://github.com/blizzhackers/kolbot) and [D2BS](https://github.com/blizzhackers/kolbot) - blizzhackers
- [Kolbot-SoloPlay](https://github.com/blizzhackers/kolbot-SoloPlay) - theBGuy
- Party mode, Arrange Bots, Bot Viewer - [kolbot-SoloPlay-Party](https://github.com/fatboi615/kolbot-SoloPlay-Party)

See `CREDITS.md` for details and licenses.
