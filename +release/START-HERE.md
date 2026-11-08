# SoloPlay Party Mode - Full Setup

Everything you need to run **3 SoloPlay characters in the same game, leveling together**:

| Profile | Class (build) | Role |
|---|---|---|
| `SCL-PAL` | Paladin (Hammerdin) | **Leader** - makes the games, walks in first |
| `SCL-SORC` | Sorceress (Lightning) | Follower - teleports ahead and opens portals ("taxi") |
| `SCL-BARB` | Barbarian (Whirlwind) | Follower - Battle Orders for the party |

This folder already has **kolbot**, **D2BS** and **Kolbot-SoloPlay with party mode**, with the three profiles above set up and party mode switched on. No accounts, CD keys or proxies are included - you add your own.

## You need

- **Diablo II + Lord of Destruction 1.14d** installed (English).
- **3 CD keys** (classic + expansion) - one per character, every running game needs its own.
- Windows 10/11.

## Setup (about 10 minutes)

### 1. Unzip
Unzip this folder somewhere simple, e.g. `C:\D2BotNG-PartyMode\`. Avoid `Program Files` and OneDrive folders.

### 2. Get D2BotNG
Download **D2BotNG.exe** (the manager) from its official page: https://github.com/ResurrectedTrader/D2BotNG/releases - the **self-contained** version needs nothing else installed.

Put `D2BotNG.exe` **in this folder**, next to `START-HERE.md`, `d2bs` and `data`.

### 3. First run
Double-click `D2BotNG.exe`. It finds your Diablo II install and uses the `d2bs` folder next to it automatically. You'll see the three profiles in the **Party** group.

> If your Diablo II isn't in `C:\Program Files (x86)\Diablo II\`, open each profile and set its game path to your `Game.exe`, and fix the game folder under **Frameworks > Default**.

### 4. CD keys
**Keys** tab > add a key list for each character (for example `pal`, `sorc`, `barb`) with that character's classic + expansion key. Then open each profile and pick its **Key list**.

### 5. Realm
The profiles use **US East**. Want another realm? Change **Realm** on all three - they must all be on the same one.

### 6. Start
1. Start **SCL-SORC** and **SCL-BARB** first. Their status shows `Party :: Waiting for leader...`
2. Then start **SCL-PAL**.

SoloPlay makes the accounts and characters by itself the first time - leave **Account / Password / Character** blank.

## What you'll see

- The leader waits in town until both followers are in the game and in the party (up to 2 minutes).
- At each waypoint the leader drops a **town portal** and waits for everyone: `Party: waiting for scl-sorc, scl-barb`.
- Before boss fights (Den, Andariel, Duriel, Mephisto...) it waits up to 45 seconds for the whole party.
- The sorc teleports ahead to areas with no waypoint and opens a portal for everyone.
- The barb casts **Battle Orders** whenever the party regroups.
- If the leader leaves (chicken / death), the followers leave too and wait for its next game.
- Whoever is furthest behind on quests hosts the game, so nobody gets left behind.

## Watching them

Double-click **`Bot Viewer.bat`** (in this folder) for one window with a live picture of all three games side by side. Click a picture (or press 1-3) to jump to that game, and use **Tuck game windows behind this one** so the game windows stop overlapping your screen.

## Changing the party

Edit `d2bs\kolbot\libs\SoloPlay\Settings\PartySettings.js`:

```js
Groups: {
  "SCL-PAL": ["SCL-SORC", "SCL-BARB"],   // leader: [followers]
},
```

- Use **profile names** exactly as they are in D2BotNG.
- All members need the **same prefix** (`SCL-`, `HCL-`...) and the entry script `D2BotSoloPlay.dbj`.
- 2 to 8 characters, all on this PC.
- Want to play solo again? Set `Enabled: false`.

Every setting is explained in that file and in [PARTY-MODE.md](d2bs/kolbot/libs/SoloPlay/PARTY-MODE.md).

## Problems?

- **Follower makes its own game / never waits for the leader** - check the profile names match `Groups` exactly and every profile uses `D2BotSoloPlay.dbj`.
- **"Profile ... not found" in the game window** - save the profile once in D2BotNG (it rewrites `d2bs\d2bs.ini`).
- **Report a bug** - see [TESTING.md](d2bs/kolbot/libs/SoloPlay/TESTING.md) for what logs to send. Remove account names, passwords and keys before posting logs.

## Credits

- [kolbot](https://github.com/blizzhackers/kolbot) and D2BS - blizzhackers
- [Kolbot-SoloPlay](https://github.com/blizzhackers/kolbot-SoloPlay) - theBGuy
- [D2BotNG](https://github.com/ResurrectedTrader/D2BotNG) - ResurrectedTrader
- Party mode - [kolbot-SoloPlay-Party](https://github.com/fatboi615/kolbot-SoloPlay-Party)
