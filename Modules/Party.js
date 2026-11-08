/**
*  @filename    Party.js
*  @desc        Party mode for Kolbot-SoloPlay. Lets several SoloPlay profiles share one game and level together.
*  @see         libs/SoloPlay/Settings/PartySettings.js for settings and a plain-english overview.
*
*  Communication is done with small json files in libs/SoloPlay/.soloplay/party/ (every profile runs on the same pc).
*  Each profile owns two files and is the only one that writes them:
*    <profile>.oog.json   written by the entry script (D2BotSoloPlay.dbj), both out of game and in game.
*                         status, game name/pass the profile is in, difficulty it wants, char name.
*    <profile>.game.json  written by the in-game main thread (SoloPlay.js).
*                         position + the party protocol fields (step/phase/script/needers, needs, doneStep...)
*
*  In-game protocol (leader drives it, everyone else reacts):
*    1. leader writes phase "plan" + step N + where in the script list we are (from)
*    2. every follower answers with needsStep = N and needs = [scripts it still wants from that point]
*    3. leader picks the first script anyone (leader included) needs, writes phase "run" + script + needers
*    4. needers run the script themselves (all at once, so they fight together); everyone else assists a needer
*    5. each member writes doneStep = N when finished; leader waits (helping) until all needers are done
*    6. repeat. When nobody needs anything else the leader writes phase "end" and the game ends.
*/

(function (module) {
  const DIR_PARENT = "libs/SoloPlay/.soloplay";
  const DIR = DIR_PARENT + "/party";
  const SETTINGS_FILE = "libs/SoloPlay/Settings/PartySettings.js";
  const DIFFS = ["Normal", "Nightmare", "Hell"];

  /** @param {*} str */
  const lc = function (str) {
    return String(str || "").toLowerCase();
  };

  const defaults = {
    Enabled: false,
    Groups: {},
    WaitForMembers: 90,
    PlanTimeout: 30,
    SyncTimeout: 15,
    LeaderLostTimeout: 10,
    StaleAfter: 300,
    SyncDifficulty: true,
    AssistRange: 12,
    FollowDistance: 7,
    LeaderLedScripts: true,
    LeaderPortals: true,
    LeaderWaits: true,
    WaitDistance: 25,
    MaxWaitSeconds: 8,
    MaxGameMinutes: 150,
    CatchUpAfterFails: 2,
    MaxCatchUpGames: 6,
    Taxi: true,
    TaxiWait: 90,
    HostRotation: true,
    HoldAtPortal: true,
    GatherWait: 20,
    BattleOrders: true,
    Debug: false,
  };

  const settings = (function () {
    let user = {};
    try {
      if (FileTools.exists(SETTINGS_FILE)) {
        user = require("../Settings/PartySettings") || {};
      }
    } catch (e) {
      console.warn("Party :: failed to load PartySettings.js - " + (e.message || e));
      user = {};
    }
    return Object.assign({}, defaults, user);
  })();

  const myProfile = lc(me.profile);

  // work out which group (if any) we belong to
  const group = (function () {
    const groups = settings.Groups || {};
    for (let lead in groups) {
      if (!groups.hasOwnProperty(lead)) continue;
      const followers = (Array.isArray(groups[lead]) ? groups[lead] : [groups[lead]])
        .map(lc)
        .filter(function (p) {
          return !!p && p !== lc(lead);
        });
      if (lc(lead) === myProfile || followers.includes(myProfile)) {
        return { leader: lc(lead), followers: followers };
      }
    }
    return null;
  })();

  const enabled = !!settings.Enabled && !!group;
  /** the leader from PartySettings - hosts unless someone is behind (HostRotation) */
  const configuredLeader = enabled ? group.leader : "";
  const members = enabled ? [configuredLeader].concat(group.followers) : [];
  // who hosts / plans THIS game. Out of game it's worked out fresh each time (see Party.hostProfile),
  // in game it's frozen to whoever made the game (setHost).
  let leader = configuredLeader;
  let followers = enabled ? group.followers.slice(0) : [];
  let isLeader = enabled && leader === myProfile;
  let isFollower = enabled && !isLeader;
  let role = !enabled ? "solo" : (isLeader ? "leader" : "follower");

  // ~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~ //
  // helpers
  // ~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~ //

  /** @param {string} name */
  const normDiff = function (name) {
    let str = lc(name);
    if (str === "highest") return "Highest";
    for (let d of DIFFS) {
      if (lc(d) === str) return d;
    }
    return "Normal";
  };

  /** @param {string} name */
  const rank = function (name) {
    let d = normDiff(name);
    return d === "Highest" ? 2 : DIFFS.indexOf(d);
  };

  const log = function (msg, toConsole = false) {
    console.log("ÿc8[Party]ÿc0 " + msg);
    if (toConsole || settings.Debug) {
      try {
        D2Bot.printToConsole("[Party] " + msg, sdk.colors.D2Bot.Blue);
      } catch (e) {
        // not fatal
      }
    }
  };

  const ensureDir = function () {
    try {
      if (!FileTools.exists(DIR)) {
        let folder = dopen(DIR_PARENT);
        folder && folder.create("party");
      }
    } catch (e) {
      // ignore - write will fail and be retried next tick
    }
  };

  /**
   * @param {string} profile
   * @param {"oog" | "game"} kind
   */
  const filePath = function (profile, kind) {
    return DIR + "/" + lc(profile) + "." + kind + ".json";
  };

  /** keep the last good read so a half-written file doesn't make someone "disappear" for one poll */
  const readCache = {};

  /** @param {string} path */
  const readJSON = function (path) {
    try {
      if (!FileTools.exists(path)) return null;
      let text = FileTools.readText(path);
      if (!text) return readCache[path] || null;
      let obj = JSON.parse(text);
      readCache[path] = obj;
      return obj;
    } catch (e) {
      return readCache[path] || null;
    }
  };

  /**
   * @param {string} path
   * @param {object} obj
   */
  const writeJSON = function (path, obj) {
    try {
      ensureDir();
      FileTools.writeText(path, JSON.stringify(obj));
      return true;
    } catch (e) {
      return false;
    }
  };

  /**
   * @param {{ tick?: number }} obj
   * @param {number} seconds
   */
  const fresh = function (obj, seconds) {
    return !!obj && typeof obj.tick === "number" && (Date.now() - obj.tick) < seconds * 1000;
  };

  const sameGame = function (name) {
    try {
      return !!name && !!me.gamename && lc(name) === lc(me.gamename);
    } catch (e) {
      return false;
    }
  };

  const Party = {
    settings: settings,
    configuredLeader: configuredLeader,
    members: members,
    myProfile: myProfile,
    normDiff: normDiff,
    rank: rank,
    log: log,
    /** set while assisting so we don't steal someone else's quest item */
    blockQuestPickup: false,
  };

  // ~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~ //
  // Host rotation - whoever is furthest behind makes the games, everyone else joins and helps.
  // (Quests like Khalim's Will only work in a game made by someone who hasn't done them.)
  // ~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~ //

  /**
   * How far along a member is: difficulty it's working on * 10 + act it has reached there.
   * Read from its game file (written in game, kept between games); falls back to its wanted difficulty.
   * @param {string} profile
   */
  Party.progressScore = function (profile) {
    let info = Party.readGameFile(profile);
    // character level breaks ties (lowest level counts as further behind)
    let level = (info && (info.level || (info.progress && info.progress.level))) || 0;
    if (info && info.progress && typeof info.progress.score === "number") return info.progress.score + level / 1000;
    let oog = Party.readOog(profile);
    return rank((oog && oog.wantDiff) || "Normal") * 10 + 1 + level / 1000;
  };

  let _frozenHost = "";
  let _hostCache = { tick: 0, value: "" };

  /** who should be making games right now */
  Party.hostProfile = function () {
    if (!enabled) return "";
    if (_frozenHost) return _frozenHost;
    if (!settings.HostRotation) return configuredLeader;
    if (Date.now() - _hostCache.tick < 3000) return _hostCache.value;

    const online = members.filter(function (m) {
      return m === myProfile || fresh(Party.readOog(m), Math.min(settings.StaleAfter, 120));
    });
    // configured leader first so it wins ties
    let best = online.includes(configuredLeader) ? configuredLeader : online[0];
    let bestScore = Party.progressScore(best);
    for (let m of online) {
      let score = Party.progressScore(m);
      if (score < bestScore) {
        best = m;
        bestScore = score;
      }
    }
    _hostCache = { tick: Date.now(), value: best || configuredLeader };
    return _hostCache.value;
  };

  /**
   * Lock who hosts this game (in game only)
   * @param {string} host
   */
  const setHost = function (host) {
    _frozenHost = host || configuredLeader;
    leader = _frozenHost;
    followers = members.filter(function (m) {
      return m !== leader;
    });
    isLeader = enabled && leader === myProfile;
    isFollower = enabled && !isLeader;
    role = isLeader ? "leader" : "follower";
  };

  /** out of game: remember whether the game we're making/joining is ours */
  Party.markHosting = function (hosting) {
    Party.oogHeartbeat(true, { hosting: !!hosting });
  };

  let _progress = { tick: 0, value: null };
  /** our own progress, published in the game file */
  const myProgress = function () {
    if (_progress.value && Date.now() - _progress.tick < 10000) return _progress.value;
    try {
      let want = rank(Party.myWantDiff());
      let act = 1;
      if (me.diff === want) {
        act = me.highestAct;
      } else if (me.diff > want) {
        act = 5;
      }
      _progress = { tick: Date.now(), value: { score: want * 10 + act, diff: DIFFS[want], act: act, level: me.charlvl } };
    } catch (e) {
      // keep the last one
    }
    return _progress.value;
  };

  // ~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~ //
  // Catch-up mode - a follower that keeps failing a quest in the party's games
  // (e.g. Khalim's Will: the orb is already broken in a game made by someone who finished it)
  // plays its own solo games until that quest is done, then rejoins the party.
  // State lives in <profile>.stuck.json, written only by the in-game main thread.
  // ~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~ //

  /** @returns {{ scripts: Record<string, number>, catchUpGames: number }} */
  Party.readStuck = function () {
    let data = readJSON(filePath(myProfile, "stuck"));
    return {
      scripts: (data && data.scripts) || {},
      catchUpGames: (data && data.catchUpGames) || 0,
    };
  };

  /** @param {{ scripts: Record<string, number>, catchUpGames: number }} data */
  const writeStuck = function (data) {
    data.tick = Date.now();
    readCache[filePath(myProfile, "stuck")] = data;
    return writeJSON(filePath(myProfile, "stuck"), data);
  };

  /** scripts we've failed often enough in party games to go do them solo */
  Party.stuckScripts = function () {
    let data = Party.readStuck();
    return Object.keys(data.scripts).filter(function (s) {
      return data.scripts[s] >= settings.CatchUpAfterFails;
    });
  };

  let _catchUpCache = { tick: 0, value: false };
  /** follower currently playing solo to catch up on quests */
  Party.inCatchUp = function () {
    if (!enabled) return false;
    // furthest behind hosts the party's games instead of going solo
    if (Party.hostProfile() === myProfile) return false;
    if (Date.now() - _catchUpCache.tick < 3000) return _catchUpCache.value;
    _catchUpCache = { tick: Date.now(), value: Party.stuckScripts().length > 0 };
    return _catchUpCache.value;
  };

  Object.defineProperty(Party, "leader", {
    get: function () {
      return enabled ? Party.hostProfile() : "";
    },
  });
  Object.defineProperty(Party, "followers", {
    get: function () {
      let host = Party.hostProfile();
      return members.filter(function (m) {
        return m !== host;
      });
    },
  });
  Object.defineProperty(Party, "isLeader", {
    get: function () {
      return enabled && Party.hostProfile() === myProfile;
    },
  });
  Object.defineProperty(Party, "enabled", {
    get: function () {
      return enabled && !Party.inCatchUp();
    },
  });
  Object.defineProperty(Party, "isFollower", {
    get: function () {
      return enabled && Party.hostProfile() !== myProfile && !Party.inCatchUp();
    },
  });
  Object.defineProperty(Party, "role", {
    get: function () {
      if (!enabled) return "solo";
      if (Party.inCatchUp()) return "catchup";
      return Party.hostProfile() === myProfile ? "leader" : "follower";
    },
  });

  Party.readOog = function (profile) {
    return readJSON(filePath(profile, "oog"));
  };

  Party.readGameFile = function (profile) {
    return readJSON(filePath(profile, "game"));
  };

  // ~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~ //
  // Out of game (entry script) side
  // ~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~ //

  /**
   * Read our CharData file WITHOUT CharData.getStats() - that one recreates the file from defaults if it
   * catches it mid-write, and the in-game threads write it all the time.
   * @returns {object | null}
   */
  const readCharData = function () {
    try {
      return readJSON(CharData.filePath);
    } catch (e) {
      return null;
    }
  };

  /** @returns {string} the difficulty this profile wants to play based on SoloPlay's own progression */
  Party.myWantDiff = function () {
    let stats = readCharData();
    if (!stats) return "Normal";
    return normDiff(stats.setDifficulty || stats.highestDifficulty || "Normal");
  };

  let _lastOogWrite = 0;
  let _oogExtra = {};

  /**
   * Called every loop of the entry script (both out of game and while in game). Throttled to 2s.
   * @param {boolean} [force]
   * @param {object} [extra] - extra fields to remember and publish (e.g. intended game name)
   */
  Party.oogHeartbeat = function (force = false, extra = null) {
    if (!enabled) return;
    extra && Object.assign(_oogExtra, extra);
    if (!force && Date.now() - _lastOogWrite < 2000) return;
    _lastOogWrite = Date.now();

    let inGame = false;
    let [game, pass, diff, charName] = ["", "", "", ""];

    try {
      inGame = !!(me.ingame && me.gameReady && me.gamename);
    } catch (e) {
      inGame = false;
    }

    if (inGame) {
      try {
        game = me.gamename || "";
        pass = me.gamepassword || "";
        diff = DIFFS[me.diff] || "";
        charName = me.name || "";
      } catch (e) {
        inGame = false;
      }
    }

    if (!charName) {
      try {
        let stats = readCharData();
        charName = (typeof Starter !== "undefined" && Starter.profileInfo && Starter.profileInfo.charName)
          || (stats && stats.charName) || "";
      } catch (e) {
        charName = "";
      }
    }

    writeJSON(filePath(myProfile, "oog"), Object.assign({}, _oogExtra, {
      profile: myProfile,
      role: Party.role,
      catchUp: Party.inCatchUp() ? Party.stuckScripts() : [],
      status: inGame ? "ingame" : "oog",
      tick: Date.now(),
      game: game,
      pass: pass,
      diff: diff,
      wantDiff: Party.myWantDiff(),
      charName: charName,
    }));
  };

  /**
   * Leader only - pick the difficulty for the next game.
   * @param {string} wanted - the difficulty SoloPlay picked for the leader itself
   * @returns {string}
   */
  Party.chooseDifficulty = function (wanted) {
    if (!Party.isLeader || !settings.SyncDifficulty) return wanted;
    let best = rank(wanted);
    let reason = "";

    for (let f of members) {
      if (f === myProfile) continue;
      let info = Party.readOog(f);
      if (!fresh(info, settings.StaleAfter)) continue;
      let r = rank(info.wantDiff);
      if (r < best) {
        best = r;
        reason = f + " still needs " + DIFFS[r];
      }
    }

    if (!reason) return wanted;
    log("Making a " + DIFFS[best] + " game instead of " + normDiff(wanted) + " because " + reason, true);
    return DIFFS[best];
  };

  /** in-memory (per entry script) list of games we failed to join */
  const joinFails = {};

  /**
   * Follower only - work out which game to join.
   * @returns {{ game?: string, pass?: string, diff?: string, wait?: string }}
   */
  Party.getJoinTarget = function () {
    let leader = Party.hostProfile();
    let info = Party.readOog(leader);
    // whoever we think should host isn't, but another member is hosting a game - go there
    if (!(info && fresh(info, 20) && info.status === "ingame" && info.hosting)) {
      for (let m of members) {
        if (m === myProfile || m === leader) continue;
        let other = Party.readOog(m);
        if (other && fresh(other, 20) && other.status === "ingame" && other.hosting && other.game) {
          leader = m;
          info = other;
          break;
        }
      }
    }

    if (!info || !fresh(info, 20)) {
      return { wait: "Waiting for leader " + leader + " to come online" };
    }
    if (info.status !== "ingame" || !info.game) {
      return { wait: "Waiting for leader " + leader + " to make a game" };
    }

    // don't go back into a game we already finished
    let mine = Party.readGameFile(myProfile);
    if (mine && mine.finishedGame && lc(mine.finishedGame) === lc(info.game)) {
      return { wait: "Waiting for leader's next game" };
    }

    if ((joinFails[lc(info.game)] || 0) >= 3) {
      return { wait: "Couldn't join " + info.game + ", waiting for leader's next game" };
    }

    let want = Party.myWantDiff();
    if (settings.SyncDifficulty && info.diff && rank(info.diff) > rank(want)) {
      return { wait: "Leader is in " + info.diff + " but we need " + want + ", waiting for next game" };
    }

    return { game: info.game, pass: info.pass || "", diff: info.diff };
  };

  /** @param {string} game */
  Party.joinFailed = function (game) {
    let key = lc(game);
    joinFails[key] = (joinFails[key] || 0) + 1;
    return joinFails[key];
  };

  /** Print warnings for setups that can't work */
  Party.validate = function () {
    if (!enabled) return true;
    let ok = true;
    let myPrefix = myProfile.split("-")[0];

    for (let p of members) {
      if (p.split("-")[0] !== myPrefix) {
        log(
          "WARNING: " + p + " has a different mode prefix than " + myProfile
          + " (" + p.split("-")[0].toUpperCase() + " vs " + myPrefix.toUpperCase() + ")."
          + " Ladder/non-ladder, hardcore/softcore and classic/expansion chars can't play in the same game.",
          true
        );
        ok = false;
      }
    }

    log(
      "Party mode ON - role: " + Party.role + " | host: " + Party.hostProfile()
      + " | configured leader: " + configuredLeader + " | members: " + members.join(", ")
      + (settings.HostRotation ? " | host rotation on (furthest behind hosts)" : ""),
      true
    );
    return ok;
  };

  // ~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~ //
  // In game side - everything below is only called from the SoloPlay.js main thread
  // ~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~ //

  /** our in-game state, written to <profile>.game.json */
  Party.state = {
    profile: myProfile,
    role: role,
    ready: false,
    // leader control fields
    step: 0,
    phase: "",
    script: "",
    needers: [],
    pass: 1,
    from: 0,
    list: [],
    // member reply fields
    needsStep: 0,
    needs: [],
    retry: [],
    doneStep: 0,
    running: "",
    finishedGame: "",
    /** @type {{ step: number, area: number, ready: boolean, failed: boolean } | null} */
    taxi: null,
  };

  let _lastGameWrite = 0;
  // ---------- town trips, regroup and Battle Orders ----------
  /** last place we stood outside town */
  let _lastField = null;
  /** set while we're in town after coming from the field - where our portal back is */
  let _townTrip = null;
  /** leader: regroup after coming out of town */
  let _gather = null;
  let _gatherCount = 0;

  /** published in our game file every heartbeat */
  const trackTownTrip = function () {
    try {
      if (!me.inTown) {
        // just came back out of town while running our own script - regroup the party here
        if (_townTrip && isLeader && _leaderBusy && settings.GatherWait > 0) {
          _gatherCount += 1;
          _gather = { id: _gatherCount, area: me.area, until: Date.now() + Time.seconds(settings.GatherWait) };
        }
        _townTrip = null;
        _lastField = { area: me.area, x: me.x, y: me.y, tick: Date.now() };
        return null;
      }
      if (!_townTrip && _lastField && Date.now() - _lastField.tick < 4000) {
        _townTrip = { area: _lastField.area, x: _lastField.x, y: _lastField.y, tick: Date.now() };
      }
      return _townTrip;
    } catch (e) {
      return null;
    }
  };

  let _hasBO = { tick: 0, value: false };
  const hasBO = function () {
    if (Date.now() - _hasBO.tick > 30000) {
      try {
        _hasBO = { tick: Date.now(), value: me.getSkill(sdk.skills.BattleOrders, sdk.skills.subindex.SoftPoints) > 0 };
      } catch (e) {
        _hasBO = { tick: Date.now(), value: false };
      }
    }
    return _hasBO.value;
  };
  const haveBOState = function () {
    try {
      return !!me.getState(sdk.states.BattleOrders);
    } catch (e) {
      return false;
    }
  };

  let _canTele = { tick: 0, value: false };
  /** can we teleport (cached, it's checked every heartbeat) */
  const canTele = function () {
    if (Date.now() - _canTele.tick > 10000) {
      try {
        _canTele = { tick: Date.now(), value: !!Pather.canTeleport() && !Config.NoTele };
      } catch (e) {
        _canTele = { tick: Date.now(), value: false };
      }
    }
    return _canTele.value;
  };
  /** @type {{ gid: number, classid: number, x: number, y: number, area: number, tick: number } | null} */
  let _target = null;

  Party.writeGame = function () {
    if (!enabled) return false;
    _lastGameWrite = Date.now();
    let live = {};
    try {
      live = {
        tick: Date.now(),
        game: me.gamename || "",
        charName: me.name,
        area: me.area,
        x: me.x,
        y: me.y,
        inTown: me.inTown,
        level: me.charlvl,
        diff: DIFFS[me.diff] || "",
        dead: !!me.dead,
        target: (_target && Date.now() - _target.tick < 3000) ? _target : null,
        canTele: canTele(),
        progress: myProgress(),
        townTrip: trackTownTrip(),
        gather: _gather ? { id: _gather.id, area: _gather.area } : null,
        hasBO: hasBO(),
        bo: haveBOState(),
      };
    } catch (e) {
      live = { tick: Date.now() };
    }
    return writeJSON(filePath(myProfile, "game"), Object.assign({}, Party.state, live));
  };

  /**
   * Remember the monster we are attacking so the rest of the party can focus it.
   * Monster gids are the same for every player in the game.
   * @param {Monster} unit
   */
  Party.noteTarget = function (unit) {
    try {
      if (!unit || !unit.gid) return;
      let changed = !_target || _target.gid !== unit.gid;
      _target = { gid: unit.gid, classid: unit.classid, x: unit.x, y: unit.y, area: me.area, tick: Date.now() };
      // publish a new target right away (throttled) so helpers switch quickly
      if (changed && Date.now() - _lastGameWrite > 250) {
        Party.writeGame();
      }
    } catch (e) {
      // ignore
    }
  };

  /**
   * Member's in-game state, only if they are in OUR game and checked in recently
   * @param {string} profile
   */
  Party.readGame = function (profile) {
    let info = Party.readGameFile(profile);
    if (!info || !fresh(info, 90) || !sameGame(info.game)) return null;
    return info;
  };

  /** @param {string} profile */
  Party.charNameOf = function (profile) {
    let info = Party.readGameFile(profile);
    if (info && info.charName && sameGame(info.game)) return info.charName;
    let oog = Party.readOog(profile);
    return (oog && oog.charName) || "";
  };

  /**
   * Is the profile's character actually in our game right now (party roster)
   * @param {string} profile
   */
  Party.inGame = function (profile) {
    if (profile === myProfile) return true;
    let name = Party.charNameOf(profile);
    if (!name) return false;
    try {
      return !!Misc.findPlayer(name);
    } catch (e) {
      return false;
    }
  };

  /**
   * Is the profile's character in OUR in-game party (not just in the game)
   * @param {string} profile
   */
  Party.inMyParty = function (profile) {
    let name = Party.charNameOf(profile);
    if (!name) return false;
    try {
      return !!Misc.inMyParty(name);
    } catch (e) {
      return false;
    }
  };

  /** followers that are in our game and have started their party loop */
  Party.activeFollowers = function () {
    return followers.filter(function (f) {
      let info = Party.readGame(f);
      return !!info && info.ready && Party.inGame(f);
    });
  };

  /** keep ToolsThread from ending the game on maxgametime while the party is working, up to MaxGameMinutes */
  Party.keepAlive = function () {
    try {
      const cap = Time.minutes(settings.MaxGameMinutes);
      const elapsed = getTickCount() - me.gamestarttime;
      if (elapsed > cap) return false;
      const want = Math.min(elapsed + Time.minutes(10), cap);
      if (me.maxgametime < want) {
        me.maxgametime = want;
      }
    } catch (e) {
      // ignore
    }
    return true;
  };

  /**
   * Scripts this member still wants to run, from a point in the list
   * @param {string[]} list
   * @param {number} from
   * @param {number} pass - 1 = normal pass, 2 = retry pass (only scripts that asked to be retried)
   */
  const doneThisPass = new Set();
  let currentPass = 1;

  const computeNeeds = function (list, from, pass) {
    const out = [];
    if (pass !== currentPass) {
      currentPass = pass;
      doneThisPass.clear();
    }

    for (let i = Math.max(0, from || 0); i < list.length; i++) {
      const script = list[i];
      if (doneThisPass.has(script)) continue;
      if (pass > 1 && !SoloIndex.retryList.includes(script)) continue;
      const entry = SoloIndex.index[script];
      if (!entry || typeof entry.shouldRun !== "function") continue;
      try {
        entry.shouldRun() && out.push(script);
      } catch (e) {
        console.warn("Party :: shouldRun failed for " + script + " - " + (e.message || e));
      }
    }

    return out;
  };

  /**
   * Run one SoloPlay script ourselves (same bookkeeping as the normal Loader.run loop)
   * @param {string} script
   * @returns {string} "ran" | "skipped" | "endrun" | "error"
   */
  const runMine = function (script) {
    let result = "error";
    _scriptName = script;
    _scriptStep = Party.state.step || _scriptStep;
    Party.blockQuestPickup = false;
    Party.state.running = script;
    Party.writeGame();
    isLeader && (_leaderBusy = true);

    try {
      result = Loader.runIndexedScript(script, SoloIndex.scripts.indexOf(script));
    } catch (e) {
      console.error(e);
      result = "error";
    } finally {
      _scriptName = "";
      _leaderBusy = false;
      doneThisPass.add(script);
      Party.state.running = "";
      Party.writeGame();
    }

    log(me.name + " :: " + script + " -> " + result);
    return result;
  };

  /**
   * Quests where, once a party member did the work, all that's left is talking to an NPC.
   * (Quests that need our own quest item - malus, staff, cube... - aren't here, those run the full script.)
   */
  const rewardTalks = {
    den: { quest: "DenofEvil", npc: "akara", act: 1 },
    bloodraven: { quest: "SistersBurialGrounds", npc: "kashya", act: 1 },
    tristram: { quest: "TheSearchForCain", npc: "akara", act: 1 },
    radament: { quest: "RadamentsLair", npc: "atma", act: 2 },
    izual: { quest: "TheFallenAngel", npc: "tyrael", act: 4 },
  };

  /**
   * If a party member already completed this script's quest for us, just go collect the reward.
   * @param {string} script
   * @returns {boolean} true if we talked to the npc
   */
  const collectReward = function (script) {
    let info = rewardTalks[script];
    if (!info) return false;
    try {
      let id = sdk.quest.id[info.quest];
      if (id === undefined) return false;
      if (Misc.checkQuest(id, sdk.quest.states.Completed)) return false;
      let ready = Misc.checkQuest(id, sdk.quest.states.ReqComplete)
        || Misc.checkQuest(id, sdk.quest.states.PartyMemberComplete);
      if (!ready || !me.accessToAct(info.act)) return false;

      me.overhead("Party: collecting " + script + " reward from " + info.npc);
      Town.goToTown(info.act);
      Town.npcInteract(info.npc);
      me.cancel();
      delay(500);
      log(me.name + " collected " + script + " reward from " + info.npc);
      return true;
    } catch (e) {
      console.warn("Party :: reward talk for " + script + " failed - " + (e.message || e));
      me.cancel();
      return false;
    }
  };

  /** does SoloPlay still want this script for us */
  const stillNeeds = function (script) {
    let entry = SoloIndex.index[script];
    try {
      return !!entry && entry.shouldRun();
    } catch (e) {
      return false;
    }
  };

  /** quest scripts whose failure is worth catching up on (not farming/leveling runs that always "need" to run) */
  const questScripts = [
    "den", "bloodraven", "tristram", "countess", "smith", "andariel", "cube", "radament", "amulet", "staff",
    "summoner", "tombs", "duriel", "lamessen", "eye", "heart", "brain", "travincal", "mephisto", "izual",
    "hellforge", "diablo", "shenk", "savebarby", "anya", "ancients", "baal",
  ];

  /**
   * Quest-complete flag (me.<flag>) for each quest script. SoloPlay's shouldRun() keeps saying "yes" for
   * scripts it also farms for exp (mephisto, diablo, baal, andariel...), so that can't tell us the quest is done.
   */
  const questFlags = {
    den: "den", bloodraven: "bloodraven", tristram: "cain", countess: "countess", smith: "smith",
    andariel: "andariel", radament: "radament", summoner: "summoner", duriel: "duriel", lamessen: "lamessen",
    travincal: "travincal", mephisto: "mephisto", izual: "izual", hellforge: "hellforge", diablo: "diablo",
    shenk: "shenk", savebarby: "savebarby", anya: "anya", ancients: "ancients", baal: "baal",
  };

  /**
   * Is this script's quest still not done for us?
   * Quests with a flag use the flag; item quests without one (cube, amulet, staff, khalim parts) use shouldRun;
   * pure farming/leveling runs never count as "not done".
   * @param {string} script
   */
  const questNotDone = function (script) {
    let flag = questFlags[script];
    if (flag) {
      try {
        if (typeof me[flag] === "boolean") return !me[flag];
      } catch (e) {
        // fall through
      }
    }
    if (questScripts.includes(script) && !flag) return stillNeeds(script);
    return false;
  };

  /**
   * Follower: after we ran a quest script ourselves in a party game, remember if it still isn't done.
   * Enough failures in a row puts us in catch-up mode (solo games) from the next game on.
   * @param {string} script
   */
  const noteAttempt = function (script) {
    if (!isFollower || !questScripts.includes(script)) return;
    let data = Party.readStuck();
    if (questNotDone(script)) {
      data.scripts[script] = (data.scripts[script] || 0) + 1;
      log(me.name + " failed " + script + " in a party game (" + data.scripts[script] + "/" + settings.CatchUpAfterFails + ")", true);
      if (data.scripts[script] >= settings.CatchUpAfterFails) {
        log(me.name + " will play solo games to catch up on " + script + ", then rejoin the party", true);
      }
    } else if (data.scripts[script]) {
      delete data.scripts[script];
    } else {
      return;
    }
    writeStuck(data);
  };

  /**
   * Call at the end of a solo catch-up game (SoloPlay.js). Clears quests that are done now and
   * sends us back to the party when nothing is left (or we've tried too many games).
   */
  Party.afterCatchUpGame = function () {
    if (!enabled || isLeader) return;
    let data = Party.readStuck();
    let before = Object.keys(data.scripts);
    if (!before.length) return;

    data.catchUpGames += 1;
    before.forEach(function (script) {
      if (!questNotDone(script)) {
        delete data.scripts[script];
        log(me.name + " caught up on " + script, true);
      }
    });

    let left = Object.keys(data.scripts).filter(function (s) {
      return data.scripts[s] >= settings.CatchUpAfterFails;
    });
    if (!left.length) {
      log(me.name + " is caught up - rejoining the party next game", true);
      data = { scripts: {}, catchUpGames: 0 };
    } else if (data.catchUpGames >= settings.MaxCatchUpGames) {
      log(me.name + " still stuck on " + left.join(", ") + " after " + data.catchUpGames + " solo games - rejoining the party anyway", true);
      data = { scripts: {}, catchUpGames: 0 };
    } else {
      log(me.name + " still catching up on " + left.join(", ") + " (solo game " + data.catchUpGames + "/" + settings.MaxCatchUpGames + ")", true);
    }
    writeStuck(data);
  };

  // ~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~ //
  // Taxi - a follower that can teleport runs ahead to the next quest area and opens a town portal,
  // everyone else waits in town and takes it instead of walking
  // ~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~ //

  /** where each quest script does its work (only areas without a waypoint - those are the long walks) */
  /** @type {Record<string, number> | null} */
  let _taxiDestinations = null;
  const taxiDestinations = function () {
    if (!_taxiDestinations) {
      _taxiDestinations = {
        bloodraven: sdk.areas.BurialGrounds,
        countess: sdk.areas.TowerCellarLvl5,
        smith: sdk.areas.Barracks,
        andariel: sdk.areas.CatacombsLvl4,
        radament: sdk.areas.A2SewersLvl3,
        cube: sdk.areas.HallsoftheDeadLvl3,
        amulet: sdk.areas.ClawViperTempleLvl2,
        staff: sdk.areas.MaggotLairLvl3,
        eye: sdk.areas.SpiderCavern,
        heart: sdk.areas.A3SewersLvl2,
        brain: sdk.areas.FlayerDungeonLvl3,
        mephisto: sdk.areas.DuranceofHateLvl3,
        izual: sdk.areas.PlainsofDespair,
        diablo: sdk.areas.ChaosSanctuary,
        shenk: sdk.areas.BloodyFoothills,
        anya: sdk.areas.FrozenRiver,
        ancients: sdk.areas.ArreatSummit,
        baal: sdk.areas.ThroneofDestruction,
      };
    }
    return _taxiDestinations;
  };

  /** @param {string} script */
  Party.taxiDestination = function (script) {
    if (!settings.Taxi) return 0;
    let area = taxiDestinations()[script];
    if (!area) return 0;
    try {
      if (Pather.wpAreas.includes(area)) return 0;
    } catch (e) {
      // ignore
    }
    return area;
  };

  /** the party's taxi: first follower in game that can teleport (the leader drops its own portals) */
  Party.taxiProfile = function () {
    if (!settings.Taxi) return "";
    for (let f of followers) {
      if (f === myProfile) {
        if (canTele() && !me.dead) return f;
        continue;
      }
      let info = Party.readGame(f);
      if (info && info.ready && info.canTele && !info.dead && Party.inGame(f)) return f;
    }
    return "";
  };

  /** what we're doing right now - used by the waypoint hook to decide whether to wait for the taxi */
  let _scriptStep = 0;
  let _scriptName = "";
  /** steps we already rode the taxi for */
  const _taxiRidden = {};

  /**
   * Taxi: teleport to the quest area, open a portal and come back to town through it (so it stays open).
   * @param {number} step
   * @param {string} script
   */
  const taxiRun = function (step, script) {
    const area = Party.taxiDestination(script);
    if (!area) return;
    const act = sdk.areas.actOf(area);
    if (!me.accessToAct(act)) return;

    Party.state.taxi = { step: step, area: area, ready: false, failed: false };
    Party.writeGame();
    me.overhead("Party: taxi to " + getAreaName(area));
    log(me.name + " teleporting ahead to " + getAreaName(area) + " for " + script);

    let ok = false;
    try {
      !me.inTown && Town.goToTown();
      Pather.journeyTo(area);
      if (me.inArea(area)) {
        ok = !!Pather.makePortal(true);
      }
    } catch (e) {
      console.warn("Party :: taxi to " + getAreaName(area) + " failed - " + (e.message || e));
    }

    // back in town through our own portal so it stays open (making a new one would close it)
    if (!me.inTown) {
      try {
        Pather.usePortal(null, me.name) || Town.goToTown();
      } catch (e) {
        Town.goToTown();
      }
    }

    Party.state.taxi = { step: step, area: area, ready: ok, failed: !ok };
    Party.writeGame();
    log(ok ? "Taxi portal is open to " + getAreaName(area) : "Taxi couldn't open a portal to " + getAreaName(area), true);
  };

  /**
   * Before a script waypoints off on its own, see if the taxi is (or will shortly be) waiting with a portal.
   * @param {number} targetArea - where the script wanted to waypoint
   * @returns {boolean} true if we went through the taxi portal instead
   */
  const rideTaxi = function (targetArea) {
    if (!settings.Taxi || !_scriptStep || _taxiRidden[_scriptStep]) return false;
    const dest = Party.taxiDestination(_scriptName);
    if (!dest || me.inArea(dest) || sdk.areas.Towns.includes(targetArea)) return false;
    const taxi = Party.taxiProfile();
    if (!taxi || taxi === myProfile) return false;
    const act = sdk.areas.actOf(dest);
    if (!me.accessToAct(act) || sdk.areas.actOf(targetArea) !== act) return false;

    _taxiRidden[_scriptStep] = true;
    const name = Party.charNameOf(taxi);
    !me.inTown && Town.goToTown(act);
    me.act !== act && Town.goToTown(act);

    // wait for the taxi to get there
    const start = getTickCount();
    let state = null;
    while (getTickCount() - start < Time.seconds(settings.TaxiWait)) {
      let info = Party.readGame(taxi);
      state = info && info.taxi && info.taxi.step === _scriptStep ? info.taxi : null;
      if (state && (state.ready || state.failed)) break;
      if (!Party.inGame(taxi)) break;
      me.overhead("Party: waiting for " + name + "'s portal to " + getAreaName(dest));
      Party.keepAlive();
      delay(500);
    }
    if (!state || !state.ready) return false;

    try {
      Town.move("portalspot");
      let portal = Misc.poll(function () {
        return Pather.getPortal(dest, name);
      }, 6000, 250);
      if (portal && Pather.usePortal(dest, name)) {
        log(me.name + " took " + name + "'s portal to " + getAreaName(dest));
        return true;
      }
    } catch (e) {
      console.warn("Party :: taxi ride failed - " + (e.message || e));
    }
    return false;
  };

  // ~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~ //
  // Assist - follow a party member and fight with them
  // ~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~ //

  let _lastTownCheck = 0;
  let _lastChores = 0;
  /** @type {Record<number, { fails: number, tick: number }>} */
  const travelFails = {};

  const needTown = function () {
    if (getTickCount() - _lastTownCheck < Time.seconds(10)) return false;
    _lastTownCheck = getTickCount();

    try {
      if (me.needPotions()) return true;
      if (Town.checkScrolls(sdk.items.TomeofTownPortal) < 3) return true;
      if (me.needRepair().length > 0) return true;
      if (me.needMerc()) return true;
    } catch (e) {
      // ignore
    }

    return false;
  };

  let _lastFieldTownTrip = 0;

  /**
   * Leave the person we're helping to go to town? Only for things SoloPlay's own TownChicken won't fix
   * (it already handles low hp / potions). Never more than once every 3 minutes.
   */
  const needTownFromField = function () {
    if (getTickCount() - _lastFieldTownTrip < Time.minutes(3)) return false;
    try {
      if (me.needRepair().length > 0) return true;
      if (Town.checkScrolls(sdk.items.TomeofTownPortal) === 0) return true;
    } catch (e) {
      // ignore
    }
    return false;
  };

  const townChores = function (force = false) {
    if (!me.inTown) return;
    if (!force && getTickCount() - _lastChores < Time.minutes(1)) return;
    _lastChores = getTickCount();

    try {
      if (force || needTown()) {
        Town.doChores();
      }
    } catch (e) {
      console.warn("Party :: town chores failed - " + (e.message || e));
    }
  };

  /**
   * @param {number} area
   * @param {string} name - char name of who we are following (to use their portal)
   * @returns {boolean}
   */
  const travelTo = function (area, name) {
    let fail = travelFails[area];
    if (fail && fail.fails >= 3 && getTickCount() - fail.tick < Time.seconds(30)) {
      // stop hammering a route that keeps failing, wait in town for a bit
      !me.inTown && Town.goToTown();
      delay(1000);
      return false;
    }

    let ok = false;

    try {
      // can we walk there from here (next door) or waypoint there?
      let nextDoor = false;
      try {
        let here = getArea(me.area);
        nextDoor = !!here && here.exits.some(function (exit) {
          return exit.target === area;
        });
      } catch (e) {
        nextDoor = false;
      }
      let haveWp = false;
      try {
        haveWp = me.haveWaypoint(area);
      } catch (e) {
        haveWp = false;
      }

      // no waypoint and not next door - go to town and use their portal if they put one down
      if (!me.inTown && !nextDoor && !haveWp) {
        me.overhead("Party: heading to town to take " + name + "'s portal");
        Town.goToTown();
      }

      // their portal is the quickest way if we are in town
      if (me.inTown) {
        // portals are only visible up close - if we can't waypoint there, go stand by the portal spot and look
        if (!haveWp && !Pather.getPortal(area, name)) {
          me.overhead("Party: looking for " + name + "'s portal");
          Town.move("portalspot");
        }
        let taxi = Party.taxiProfile();
        let taxiName = taxi ? (taxi === myProfile ? me.name : Party.charNameOf(taxi)) : "";
        let owner = name;
        let portal = Misc.poll(function () {
          if (Pather.getPortal(area, name)) {
            owner = name;
            return true;
          }
          if (taxiName && Pather.getPortal(area, taxiName)) {
            owner = taxiName;
            return true;
          }
          return false;
        }, haveWp ? 1000 : 6000, 250);
        if (portal) {
          Town.move("portalspot");
          ok = Pather.usePortal(area, owner);
        }
      }

      if (!ok && !me.inArea(area)) {
        Pather.journeyTo(area);
      }
    } catch (e) {
      console.warn("Party :: travel to " + getAreaName(area) + " failed - " + (e.message || e));
    }

    ok = me.inArea(area);

    if (ok) {
      delete travelFails[area];
    } else {
      fail = travelFails[area] || { fails: 0, tick: 0 };
      fail.fails += 1;
      fail.tick = getTickCount();
      travelFails[area] = fail;
    }

    return ok;
  };

  /**
   * Attack the monster the member we're helping is attacking, for a short burst.
   * @param {string} profile
   * @param {string} name - their char name
   * @returns {boolean} true if we attacked something
   */
  let _lastBOGather = 0;

  const focusFire = function (profile, name) {
    const start = getTickCount();
    let attacked = false;

    while (getTickCount() - start < Time.seconds(4)) {
      let info = Party.readGameFile(profile);
      let t = info && sameGame(info.game) ? info.target : null;
      if (!t || !t.gid || Date.now() - t.tick > 3000 || t.area !== me.area) break;

      let mon = Game.getMonster(-1, -1, t.gid);
      if (!mon || mon.dead || !mon.attackable) break;
      // too far from the person we're helping - probably a stale target, go to them instead
      let them = Misc.getPlayerUnit(name);
      if (them && getDistance(them, mon) > 35) break;
      if (typeof Attack.canAttack === "function" && !Attack.canAttack(mon)) break;

      try {
        Party.noteTarget(mon);
        ClassAttack[me.classid].doAttack(mon, !attacked);
        attacked = true;
      } catch (e) {
        console.warn("Party :: focus fire error - " + (e.message || e));
        break;
      }
      delay(20);
    }

    attacked && Pickit.pickItems();
    return attacked;
  };

  /**
   * One short slice of following + fighting next to a party member. Callers loop on this.
   * @param {string} profile
   * @returns {boolean}
   */
  Party.assistTick = function (profile) {
    Party.blockQuestPickup = true;

    try {
      const info = Party.readGameFile(profile);
      const name = Party.charNameOf(profile);
      if (!name) {
        delay(500);
        return false;
      }

      const partyUnit = Misc.findPlayer(name);
      if (!partyUnit) {
        delay(500);
        return false;
      }

      let area = partyUnit.area || (info && sameGame(info.game) ? info.area : 0);
      if (!area) {
        delay(500);
        return false;
      }

      const act = sdk.areas.actOf(area);

      // they are in town - meet them there
      if (sdk.areas.Towns.includes(area)) {
        // they popped to town from where we are - hold at their portal until they come back
        let trip = info && sameGame(info.game) ? info.townTrip : null;
        if (settings.HoldAtPortal && trip && !me.inTown && me.inArea(trip.area) && Date.now() - trip.tick < Time.minutes(3)) {
          if (getDistance(me.x, me.y, trip.x, trip.y) > 6) {
            try {
              Pather.moveNear(trip.x, trip.y, 4);
            } catch (e) {
              // ignore
            }
          }
          Attack.clear(10);
          me.overhead("Party: holding at " + name + "'s portal");
          delay(250);
          return true;
        }
        if (!me.inTown || me.act !== act) {
          me.accessToAct(act) ? Town.goToTown(act) : Town.goToTown();
        }
        townChores();
        delay(500);
        return true;
      }

      // different area - go to them
      if (!me.inArea(area)) {
        if (!me.accessToAct(act)) {
          me.overhead("Party: can't reach " + name + " in " + getAreaName(area));
          !me.inTown && Town.goToTown();
          delay(2000);
          return false;
        }

        me.inTown && townChores();
        me.overhead("Party: going to " + name + " (" + getAreaName(area) + ")");
        return travelTo(area, name);
      }

      // same area - stay close and fight what they are fighting
      let unit = Misc.getPlayerUnit(name);
      let [tx, ty] = unit ? [unit.x, unit.y] : [partyUnit.x, partyUnit.y];

      // 0. leader is regrouping - if we have Battle Orders, buff the party once we're next to them
      let gather = info && sameGame(info.game) ? info.gather : null;
      if (settings.BattleOrders && gather && gather.id !== _lastBOGather && hasBO() && tx && ty
        && getDistance(me.x, me.y, tx, ty) <= 12) {
        _lastBOGather = gather.id;
        try {
          me.overhead("Party: Battle Orders!");
          Precast.doPrecast(true);
        } catch (e) {
          console.warn("Party :: battle orders failed - " + (e.message || e));
        }
      }

      // 1. hit their target first
      if (focusFire(profile, name)) {
        return true;
      }

      // 2. no target - stay right on them
      if (tx && ty && getDistance(me.x, me.y, tx, ty) > settings.FollowDistance) {
        try {
          Pather.moveNear(tx, ty, Math.max(3, settings.FollowDistance - 3));
        } catch (e) {
          // ignore, try again next tick
        }
      }

      // 3. only clear what's close (anything attacking us / them) so we don't wander off
      Attack.clear(settings.AssistRange);

      if (needTownFromField()) {
        _lastFieldTownTrip = getTickCount();
        Town.visitTown(me.needRepair().length > 0);
      }

      delay(100);
      return true;
    } catch (e) {
      console.warn("Party :: assist error - " + (e.message || e));
      delay(1000);
      return false;
    } finally {
      Party.blockQuestPickup = false;
    }
  };

  /**
   * Is everyone in `needers` (that is still in game) finished with `step`
   * @param {number} step
   * @param {string[]} needers
   */
  const allDone = function (step, needers) {
    return needers.every(function (p) {
      if (p === myProfile) return Party.state.doneStep >= step;
      if (!Party.inGame(p)) return true;
      let info = Party.readGame(p);
      // can't read them but they're in game - give them the benefit of the doubt until timeout
      return !!info && info.doneStep >= step;
    });
  };

  /**
   * Pick who to help: an unfinished needer (leader first), otherwise the leader
   * @param {number} step
   * @param {string[]} needers
   * @returns {string}
   */
  const pickTarget = function (step, needers) {
    let pending = (needers || []).filter(function (p) {
      if (p === myProfile) return false;
      if (!Party.inGame(p)) return false;
      let info = Party.readGame(p);
      return !info || info.doneStep < step;
    });

    if (pending.includes(leader)) return leader;
    if (pending.length) return pending[0];
    // everyone's finished this step - wait for the next plan instead of chasing the host across acts
    return "";
  };

  /**
   * Help whoever is still working on `step` until they're all done
   * @param {number} step
   * @param {string[]} needers
   * @param {number} timeoutMinutes
   */
  const assistUntilDone = function (step, needers, timeoutMinutes) {
    const start = getTickCount();
    let announced = false;

    while (!allDone(step, needers)) {
      if (getTickCount() - start > Time.minutes(timeoutMinutes)) {
        log("Stopped waiting on step " + step + " after " + timeoutMinutes + " min", true);
        break;
      }
      if (!Party.keepAlive()) break;
      if (me.dead) break;

      let target = pickTarget(step, needers);
      if (!target || target === myProfile) {
        delay(500);
        continue;
      }

      if (!announced) {
        announced = true;
        console.log("ÿc8[Party]ÿc0 helping " + target + " with " + Party.state.script);
      }

      Party.assistTick(target);
    }
  };

  // ~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~ //
  // Leader loop
  // ~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~ //

  const runLeader = function () {
    // who is online and should show up
    const expected = followers.filter(function (f) {
      let info = Party.readOog(f);
      return fresh(info, Math.min(settings.StaleAfter, 120)) && info.role !== "catchup";
    });
    followers.forEach(function (f) {
      let info = Party.readOog(f);
      if (info && info.role === "catchup") {
        log(f + " is playing solo to catch up on: " + (info.catchUp || []).join(", "), true);
      }
    });

    Party.state.phase = "wait";
    Party.writeGame();

    if (expected.length) {
      const start = getTickCount();
      Town.goToTown();
      while (getTickCount() - start < Time.seconds(settings.WaitForMembers)) {
        let missing = expected.filter(function (f) {
          let info = Party.readGame(f);
          return !info || !info.ready || !Party.inMyParty(f);
        });
        if (!missing.length) break;
        me.overhead(
          "Party: waiting for " + missing.join(", ") + " ("
          + Math.round((Time.seconds(settings.WaitForMembers) - (getTickCount() - start)) / 1000) + "s)"
        );
        Party.keepAlive();
        delay(1000);
      }
      let here = Party.activeFollowers();
      let partied = here.filter(Party.inMyParty);
      log(
        "Starting with " + (here.length ? here.join(", ") : "nobody") + " (expected: " + expected.join(", ") + ")"
        + " | in party: " + (partied.length ? partied.join(", ") : "nobody"),
        true
      );
    } else {
      log("No followers online, playing like solo but still in party mode", true);
    }

    let step = 0;
    let stop = false;

    for (let pass = 1; pass <= 2 && !stop; pass++) {
      let list;

      if (pass === 1) {
        list = SoloIndex.scripts.slice(0);
      } else {
        // retry pass: union of everyone's retry lists, in script order
        let union = SoloIndex.retryList.slice(0);
        for (let f of Party.activeFollowers()) {
          let info = Party.readGame(f);
          info && Array.isArray(info.retry) && info.retry.forEach(function (s) {
            !union.includes(s) && union.push(s);
          });
        }
        list = SoloIndex.scripts.filter(function (s) {
          return union.includes(s);
        });
        if (!list.length) break;
        log("Retry pass: " + list.join(", "));
      }

      let pointer = 0;

      while (pointer < list.length) {
        if (!Party.keepAlive()) {
          log("Max party game time reached", true);
          stop = true;
          break;
        }

        step += 1;

        // 1. plan
        Object.assign(Party.state, {
          step: step, phase: "plan", pass: pass, from: pointer, list: list, script: "", needers: [],
        });
        Party.writeGame();

        const myNeeds = computeNeeds(list, pointer, pass);
        const active = Party.activeFollowers();
        /** @type {Record<string, string[]>} */
        const replies = {};
        const planStart = getTickCount();

        while (true) {
          let waiting = 0;
          for (let f of active) {
            if (replies[f]) continue;
            let info = Party.readGame(f);
            if (info && info.needsStep === step) {
              replies[f] = Array.isArray(info.needs) ? info.needs : [];
            } else if (Party.inGame(f)) {
              waiting += 1;
            }
          }
          if (!waiting || getTickCount() - planStart > Time.seconds(settings.PlanTimeout)) break;
          delay(200);
        }

        // 2. pick the first script anybody needs
        let index = -1;
        let needers = [];

        for (let i = pointer; i < list.length; i++) {
          let who = [];
          myNeeds.includes(list[i]) && who.push(myProfile);
          for (let f in replies) {
            replies[f].includes(list[i]) && who.push(f);
          }
          if (who.length) {
            index = i;
            needers = who;
            break;
          }
        }

        if (index === -1) break;

        const script = list[index];
        pointer = index + 1;

        // 3. run
        Object.assign(Party.state, { phase: "run", script: script, needers: needers });
        Party.writeGame();
        log("Step " + step + ": " + script + " | running: " + needers.join(", "));

        if (needers.includes(myProfile)) {
          let result = runMine(script);
          if (result === "endrun") {
            stop = true;
          }
        }

        Party.state.doneStep = step;
        Party.writeGame();

        // 4. wait for (and help) everyone else that is running it
        assistUntilDone(step, needers, settings.SyncTimeout);

        if (me.dead) {
          stop = true;
          break;
        }
        if (stop) break;
      }
    }

    Object.assign(Party.state, { phase: "end", script: "", needers: [] });
    Party.writeGame();
    log("Leader finished the script list, ending game", true);
    // give followers a moment to see the end flag
    delay(2000);
  };

  // ~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~ //
  // Follower loop
  // ~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~ //

  const runFollower = function () {
    let handledPlan = 0;
    let handledRun = 0;
    let lostSince = 0;

    const leaderState = function () {
      let info = Party.readGameFile(leader);
      if (!info || !fresh(info, 90) || !sameGame(info.game)) return null;
      return info;
    };

    /** answer a plan request (or pre-answer the next one) */
    const answer = function (step, list, from, pass) {
      Party.state.needs = computeNeeds(list, from, pass);
      Party.state.needsStep = step;
      Party.state.retry = SoloIndex.retryList.slice(0);
      Party.writeGame();
    };

    /**
     * Stay with the leader (fighting its targets) until it finishes `step`
     * @param {number} step
     * @param {string} script
     */
    const followLeaderThrough = function (step, script) {
      Party.state.running = script + " (with leader)";
      Party.writeGame();
      let lost = 0;

      while (true) {
        if (!Party.keepAlive() || me.dead) break;
        let ls = leaderState();
        if (!ls || !Party.inGame(leader)) {
          !lost && (lost = getTickCount());
          if (getTickCount() - lost > Time.seconds(settings.LeaderLostTimeout)) break;
          delay(500);
          continue;
        }
        lost = 0;
        if (ls.step !== step || ls.doneStep >= step || ls.phase !== "run") break;
        Party.assistTick(leader);
      }

      Party.state.running = "";
      Party.writeGame();
    };

    log(me.name + " joined as follower of " + leader);

    // make sure we are actually partied with the leader before doing anything (SimpleParty does the clicking)
    const partyStart = getTickCount();
    while (!Party.inMyParty(leader) && getTickCount() - partyStart < Time.seconds(45)) {
      me.overhead("Party: joining " + leader + "'s party");
      Party.keepAlive();
      delay(1000);
    }
    log(Party.inMyParty(leader) ? "Partied with leader " + leader : "Couldn't party with " + leader + " - continuing anyway", true);

    while (true) {
      if (!Party.keepAlive()) {
        log("Max party game time reached, leaving");
        break;
      }
      if (me.dead || _leaderGone) break;

      const ls = leaderState();
      const leaderHere = Party.inGame(leader);

      if (!ls || !leaderHere) {
        !lostSince && (lostSince = getTickCount());
        if (getTickCount() - lostSince > Time.seconds(settings.LeaderLostTimeout)) {
          log("Leader isn't in this game anymore, leaving", true);
          break;
        }
        me.overhead("Party: waiting for leader " + leader);
        !me.inTown && Town.goToTown();
        delay(1000);
        continue;
      }
      lostSince = 0;

      if (ls.phase === "end") {
        log("Leader ended the game");
        break;
      }

      const list = Array.isArray(ls.list) && ls.list.length ? ls.list : SoloIndex.scripts;

      if (ls.phase === "plan" && ls.step > handledPlan) {
        handledPlan = ls.step;
        // always re-answer with fresh info (a pre-answer may already be there, this just updates it)
        answer(ls.step, list, ls.from, ls.pass);
        continue;
      }

      if (ls.phase === "run" && ls.step > handledRun) {
        handledRun = ls.step;
        handledPlan = Math.max(handledPlan, ls.step);
        _scriptStep = ls.step;
        const needers = Array.isArray(ls.needers) ? ls.needers : [];

        // we can teleport - run ahead and open a portal for everyone
        if (Party.taxiProfile() === myProfile && Party.taxiDestination(ls.script)) {
          taxiRun(ls.step, ls.script);
        }

        if (needers.includes(myProfile)) {
          if (settings.LeaderLedScripts && needers.includes(leader)) {
            // leader is doing it too - stick to the leader and fight together instead of running our own copy
            followLeaderThrough(ls.step, ls.script);
            // the leader did the work - if all that's left is talking to an npc, just do that
            let stillNeed = questNotDone(ls.script);
            if (stillNeed && collectReward(ls.script)) {
              stillNeed = questNotDone(ls.script);
            }
            // still need it after that (no quest credit, etc)? run it ourselves, leader will come help
            if (stillNeed && Party.inGame(leader)) {
              log(me.name + " still needs " + ls.script + " after following, running it now");
              me.overhead("Party: catching up on " + ls.script);
              runMine(ls.script);
              noteAttempt(ls.script);
            } else {
              doneThisPass.add(ls.script);
            }
          } else {
            me.overhead("Party: running " + ls.script);
            runMine(ls.script);
            noteAttempt(ls.script);
          }
        }

        Party.state.doneStep = ls.step;
        // pre-answer the next plan so a busy follower doesn't miss it
        answer(ls.step + 1, list, list.indexOf(ls.script) + 1, ls.pass);
        continue;
      }

      // nothing new from the leader - go help someone
      let target = ls.phase === "run" ? pickTarget(ls.step, ls.needers) : leader;
      if (target && target !== myProfile) {
        Party.assistTick(target);
      } else {
        delay(250);
      }
    }

    // remember this game is done so the entry script doesn't rejoin it
    Party.state.finishedGame = me.gamename || "";
    Party.state.phase = "left";
    Party.writeGame();
  };

  // ~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~ //
  // In game entry points
  // ~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~ //

  let _initialized = false;
  /** leader is running one of its own scripts right now */
  let _leaderBusy = false;
  let _leaderSeenTick = 0;
  let _leaderGone = false;
  let _lastWatch = 0;
  let _lastPaceCheck = 0;
  let _paceCooldownUntil = 0;
  /** @type {Record<number, number>} area -> tick we last put a portal down there */
  const _portalAreas = {};

  /** monsters close to us that we'd be ignoring if we stood still */
  const monstersNear = function (range) {
    try {
      let mon = Game.getMonster();
      if (mon) {
        do {
          if (mon.attackable && getDistance(me, mon) <= range) return true;
        } while (mon.getNext());
      }
    } catch (e) {
      return true;
    }
    return false;
  };

  /**
   * Follower: if the leader leaves the game (chicken, death, crash, game over) we leave too and wait for the next one.
   * Runs from the background worker, so it works even in the middle of a script.
   */
  const leaderWatchdog = function () {
    if (_leaderGone || Date.now() - _lastWatch < 2000) return;
    _lastWatch = Date.now();
    if (!me.gameReady) return;

    if (Party.inGame(leader)) {
      _leaderSeenTick = Date.now();
      return;
    }
    // only start counting once we've seen them in this game
    if (!_leaderSeenTick) return;

    if (Date.now() - _leaderSeenTick > Time.seconds(settings.LeaderLostTimeout)) {
      _leaderGone = true;
      Party.state.finishedGame = me.gamename || "";
      Party.state.phase = "left";
      Party.writeGame();
      log("Leader left the game - leaving and waiting for the next one", true);
      me.overhead("Party: leader left, leaving game");
      scriptBroadcast("quit");
    }
  };

  /**
   * Leader: hold still for a moment if a follower is falling behind. Never while monsters are close.
   * Runs from the background worker inside delay(), so the leader's script is simply paused.
   */
  /** leader: after coming out of town, wait for everyone to gather and get Battle Orders */
  const gatherCheck = function () {
    if (!_gather || !_leaderBusy) return false;
    if (me.inTown || me.dead || Date.now() > _gather.until || !me.inArea(_gather.area)) {
      _gather = null;
      return false;
    }

    const active = Party.activeFollowers();
    if (!active.length) {
      _gather = null;
      return false;
    }
    const boInParty = settings.BattleOrders && (hasBO() || active.some(function (f) {
      let info = Party.readGame(f);
      return !!info && info.hasBO;
    }));

    const notReady = function () {
      return active.filter(function (f) {
        let info = Party.readGame(f);
        if (!info || info.dead || !Party.inGame(f)) return false;
        if (info.area !== me.area || getDistance(me.x, me.y, info.x, info.y) > 12) return true;
        return boInParty && !info.bo;
      });
    };

    let waiting = notReady();
    if (!waiting.length && (!boInParty || haveBOState())) {
      _gather = null;
      return false;
    }

    let castBO = false;
    me.overhead("Party: regrouping" + (boInParty ? " for Battle Orders" : ""));
    while (Date.now() < _gather.until) {
      if (me.dead || monstersNear(15)) break;
      global._delay ? global._delay(250) : nativeSleep(250);
      Party.writeGame();
      waiting = notReady();
      // everyone's here - if we're the one with BO, cast it now
      let here = waiting.filter(function (f) {
        let info = Party.readGame(f);
        return !!info && (info.area !== me.area || getDistance(me.x, me.y, info.x, info.y) > 12);
      });
      if (!here.length && hasBO() && !castBO) {
        castBO = true;
        try {
          Precast.doPrecast(true);
        } catch (e) {
          // ignore
        }
      }
      if (!waiting.length && (!boInParty || haveBOState())) break;
    }
    _gather = null;
    return true;
  };

  const paceCheck = function () {
    if (!settings.LeaderWaits || !_leaderBusy) return;
    if (Date.now() - _lastPaceCheck < 1500 || Date.now() < _paceCooldownUntil) return;
    _lastPaceCheck = Date.now();
    if (me.inTown || me.dead || !me.idle) return;

    const lagging = function () {
      return followers.filter(function (f) {
        let info = Party.readGame(f);
        if (!info || !info.ready || info.dead || !Party.inGame(f)) return false;
        // in town: only wait if it's on its way to us (following us through a script), not shopping
        if (info.inTown) return String(info.running || "").indexOf("with leader") > -1;
        // busy with its own script somewhere else - not trying to keep up with us
        if (info.running && String(info.running).indexOf("with leader") === -1) return false;
        // following us into this area - wait if they're far back
        if (info.area === me.area) return getDistance(me.x, me.y, info.x, info.y) > settings.WaitDistance;
        // on their way to us from another (non town) area
        return true;
      });
    };

    let behind = lagging();
    if (!behind.length || monstersNear(20)) return;

    const start = Date.now();
    me.overhead("Party: waiting for " + behind.join(", "));
    while (Date.now() - start < Time.seconds(settings.MaxWaitSeconds)) {
      global._delay ? global._delay(250) : nativeSleep(250);
      Party.writeGame();
      if (me.dead || monstersNear(20)) break;
      behind = lagging();
      if (!behind.length) break;
    }
    // let the leader move for a bit before checking again
    _paceCooldownUntil = Date.now() + Time.seconds(4);
  };

  /** Leader: put a town portal down when we arrive somewhere a follower isn't */
  const leaderPortal = function () {
    if (!settings.LeaderPortals || !isLeader || me.inTown || me.dead) return;
    if (_portalAreas[me.area] && Date.now() - _portalAreas[me.area] < Time.minutes(2)) return;

    let needs = Party.activeFollowers().filter(function (f) {
      let info = Party.readGame(f);
      return !!info && info.area !== me.area;
    });
    if (!needs.length) return;

    try {
      if (Pather.makePortal(false)) {
        _portalAreas[me.area] = Date.now();
        log("Portal down in " + getAreaName(me.area) + " for " + needs.join(", "));
      }
    } catch (e) {
      console.warn("Party :: couldn't make portal - " + (e.message || e));
    }
  };

  /** Call once from SoloPlay.js after Config/Pickit init. */
  Party.initInGame = function () {
    if (!Party.enabled || _initialized) return false;
    _initialized = true;

    // who made this game is the host for this game
    let gameHost = "";
    for (let m of members) {
      let info = Party.readOog(m);
      if (info && info.hosting && info.status === "ingame" && sameGame(info.game)) {
        gameHost = m;
        break;
      }
    }
    // no host flag found (shouldn't happen) - same answer for everyone: configured leader if it's here
    if (!gameHost) {
      gameHost = (configuredLeader === myProfile || Party.inGame(configuredLeader)) ? configuredLeader : Party.hostProfile();
    }
    setHost(gameHost);
    Party.state.role = role;
    log("This game's host: " + leader + (leader !== configuredLeader ? " (furthest behind)" : ""), true);

    // invite / accept everyone (games are passworded so it's just us)
    Config.PublicMode = true;

    // never pick up quest items while helping someone else - they're theirs
    const originalCheckItem = Pickit.checkItem;
    Pickit.checkItem = function (unit) {
      if (Party.blockQuestPickup && unit && sdk.quest.items.includes(unit.classid)) {
        return { result: Pickit.Result.UNWANTED, line: null };
      }
      return originalCheckItem.apply(this, arguments);
    };

    // record what we attack so the party can focus the same monster
    try {
      const classAttack = ClassAttack[me.classid];
      if (classAttack && typeof classAttack.doAttack === "function" && !classAttack.__partyHooked) {
        const originalDoAttack = classAttack.doAttack;
        classAttack.doAttack = function (unit) {
          Party.noteTarget(unit);
          return originalDoAttack.apply(this, arguments);
        };
        classAttack.__partyHooked = true;
      }
    } catch (e) {
      console.warn("Party :: couldn't hook doAttack - " + (e.message || e));
    }

    // keep our state file fresh while the main thread is busy (runs inside delay())
    const Worker = require("../../modules/Worker");
    Worker.runInBackground.partyHeartbeat = function () {
      try {
        if (Date.now() - _lastGameWrite > 1000) {
          Party.writeGame();
        }
        isFollower && leaderWatchdog();
        isLeader && (gatherCheck() || paceCheck());
      } catch (e) {
        // never let the heartbeat kill the main thread
      }
      return true;
    };

    // leader: heading back to the area we just popped to town from - use our own portal (followers are waiting at it)
    if (isLeader && settings.HoldAtPortal) {
      const waypointBeforeReturn = Pather.useWaypoint;
      Pather.useWaypoint = function (targetArea) {
        try {
          if (_leaderBusy && me.inTown && _townTrip && targetArea === _townTrip.area
            && Date.now() - _townTrip.tick < Time.minutes(3)) {
            let back = _townTrip.area;
            Town.move("portalspot");
            let portal = Misc.poll(function () {
              return Pather.getPortal(back, me.name);
            }, 3000, 250);
            if (portal && Pather.usePortal(back, me.name)) {
              log("Back through our portal to " + getAreaName(back));
              return true;
            }
          }
        } catch (e) {
          console.warn("Party :: portal back failed - " + (e.message || e));
        }
        return waypointBeforeReturn.apply(this, arguments);
      };
    }

    // everyone: when the taxi is opening a portal to where this script is going, take it instead of the waypoint
    if (settings.Taxi) {
      const waypointBeforeTaxi = Pather.useWaypoint;
      Pather.useWaypoint = function (targetArea) {
        try {
          if (_scriptName && rideTaxi(targetArea)) return true;
        } catch (e) {
          console.warn("Party :: taxi hook - " + (e.message || e));
        }
        return waypointBeforeTaxi.apply(this, arguments);
      };
    }

    // leader: drop a portal after arriving somewhere new so followers without the waypoint can come
    if (isLeader && settings.LeaderPortals) {
      const originalUseWaypoint = Pather.useWaypoint;
      Pather.useWaypoint = function () {
        let result = originalUseWaypoint.apply(this, arguments);
        try {
          _leaderBusy && !me.inTown && leaderPortal();
        } catch (e) {
          // ignore
        }
        return result;
      };
      const originalMoveToExit = Pather.moveToExit;
      Pather.moveToExit = function (targetArea, use) {
        let before = me.area;
        let result = originalMoveToExit.apply(this, arguments);
        try {
          use && _leaderBusy && me.area !== before && !me.inTown && leaderPortal();
        } catch (e) {
          // ignore
        }
        return result;
      };
    }

    Party.state.ready = false;
    Party.state.finishedGame = "";
    Party.writeGame();

    return true;
  };

  /** Replaces Loader.run() in party mode */
  Party.run = function () {
    if (!Party.enabled) return Loader.run();

    // same difficulty bookkeeping Loader.run does
    let updatedDifficulty = Check.nextDifficulty();
    if (updatedDifficulty) {
      CharData.updateData("me", "setDifficulty", updatedDifficulty);
      !me.realm && Messaging.sendToScript("D2BotSoloPlay.dbj", "diffChange");
    }

    Party.state.ready = true;
    Party.writeGame();

    try {
      isLeader ? runLeader() : runFollower();
    } catch (e) {
      console.error(e);
      log("Party loop crashed: " + (e.message || e), true);
    }

    if (!updatedDifficulty) {
      updatedDifficulty = Check.nextDifficulty(false);
      if (updatedDifficulty) {
        CharData.updateData("me", "setDifficulty", updatedDifficulty);
        !me.realm && Messaging.sendToScript("D2BotSoloPlay.dbj", "diffChange");
      }
    }

    // quests we were stuck on that got done in this game (e.g. we hosted)
    try {
      let stuck = Party.readStuck();
      let changed = false;
      Object.keys(stuck.scripts).forEach(function (script) {
        if (!questNotDone(script)) {
          delete stuck.scripts[script];
          changed = true;
        }
      });
      changed && writeStuck(stuck);
    } catch (e) {
      // ignore
    }

    Party.state.ready = false;
    Party.writeGame();

    return true;
  };

  module.exports = Party;
})(module);
