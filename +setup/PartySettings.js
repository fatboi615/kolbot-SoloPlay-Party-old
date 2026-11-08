/**
*  @filename    PartySettings.js
*  @desc        Party mode for Kolbot-SoloPlay - several SoloPlay profiles play in the SAME game and level together.
*
*  How it works (short version):
*   - The LEADER profile makes the games exactly like normal SoloPlay does.
*   - FOLLOWER profiles never make games, they join the leader's current game.
*   - In game the leader walks the normal SoloPlay script list. Before each script it asks every follower
*     "do you still need this?". Anyone who needs it runs it (at the same time, so they fight together),
*     anyone who doesn't follows and helps the person who does. The party waits for each other before
*     moving to the next script, so everyone gets quest credit and stays the same pace.
*   - Games are made in the LOWEST difficulty any member still needs, so nobody gets left behind.
*
*  Requirements:
*   - Every profile uses D2BotSoloPlay.dbj as its entry script and a normal SoloPlay profile name
*     (SCL-SORC, SCL-PAL, SCL-BAR ...). All members must share the same prefix (all SCL, or all HCL, etc).
*   - All profiles run on the same PC / same D2BotNG (they talk through files in libs/SoloPlay/.soloplay/party).
*   - Same realm for everyone.
*/

(function (module) {
  module.exports = {
    /**
     * @desc - master switch for party mode. false = every profile plays solo like before.
     */
    Enabled: false,

    /**
     * @desc - party groups. Format: "leader profile": ["follower profile", "follower profile", ...]
     *   Use PROFILE names (window title in D2BotNG), not character names. Up to 7 followers per leader.
     *   Profiles that aren't listed here keep playing solo.
     * @example
     *   Groups: {
     *     "SCL-SORC": ["SCL-PAL", "SCL-BAR"],
     *     "SCL-NEC": ["SCL-ZON"],
     *   },
     */
    Groups: {
      // tip: make the tankiest character the leader - it walks into every fight first
      // "SCL-PAL": ["SCL-SORC", "SCL-BARB"],
    },

    /**
     * @desc - seconds the leader waits at the start of each game for followers that are online to join
     */
    WaitForMembers: 120,

    /**
     * @desc - seconds the leader waits for followers to answer "what do you still need?" before each script
     */
    PlanTimeout: 30,

    /**
     * @desc - minutes the party waits for a slow member to finish a script before moving on without them
     */
    SyncTimeout: 15,

    /**
     * @desc - seconds a follower stays in game after the leader disappears (chicken, death, crash, game over)
     *   before it leaves too. It then waits at the join screen for the leader's NEXT game.
     */
    LeaderLostTimeout: 10,

    /**
     * @desc - a member that hasn't checked in for this many seconds is treated as offline
     *   (the leader won't wait for it and won't lower the difficulty for it)
     */
    StaleAfter: 300,

    /**
     * @desc - make games in the lowest difficulty any online member needs
     */
    SyncDifficulty: true,

    /**
     * @desc - when the leader and a follower both need a script (den, andariel...), the follower does NOT run
     *   its own copy. It sticks to the leader and attacks whatever the leader is attacking. If it still needs
     *   the script afterwards (didn't get quest credit) it runs it then, with the leader helping.
     *   false = everyone who needs a script runs their own copy at the same time.
     */
    LeaderLedScripts: true,

    /**
     * @desc - helpers move back to whoever they are following when they get further away than this (yards)
     */
    FollowDistance: 7,

    /**
     * @desc - when there is no shared target, helpers only clear monsters this close to them (yards).
     *   Keep it small so they don't wander off from the person they are following.
     */
    AssistRange: 12,

    /**
     * @desc - leader drops a town portal when it arrives in a new area (waypoint or exit) and a follower isn't there,
     *   so followers that don't have that waypoint can come through the portal instead of walking
     */
    LeaderPortals: true,

    /**
     * @desc - leader holds still for a moment while a follower catches up (never while monsters are close)
     */
    LeaderWaits: true,

    /**
     * @desc - a follower in the same area further away than this (yards) counts as "falling behind"
     */
    WaitDistance: 25,

    /**
     * @desc - longest the leader holds still at a time (seconds) before moving on again
     */
    MaxWaitSeconds: 8,

    /**
     * @desc - a follower that fails the same quest this many party games in a row switches to catch-up mode:
     *   it makes its own games and plays normal SoloPlay until that quest is done, then rejoins the party.
     *   Some quests can't be done in a game made by someone who already finished them
     *   (e.g. Khalim's Will - the Compelling Orb is already broken), so the follower has to do them solo.
     */
    CatchUpAfterFails: 2,

    /**
     * @desc - most solo catch-up games before a follower gives up and rejoins the party anyway
     */
    MaxCatchUpGames: 6,

    /**
     * @desc - taxi: a follower that can teleport (sorc) runs ahead to the next quest area (Catacombs 4, Durance 3,
     *   Chaos Sanctuary...) and opens a town portal. Everyone else waits in town and takes it instead of walking.
     */
    Taxi: true,

    /**
     * @desc - seconds the others wait in town for the taxi's portal before walking/waypointing like normal
     */
    TaxiWait: 90,

    /**
     * @desc - host rotation: whoever is furthest behind (difficulty, then act) makes the games and runs the plan,
     *   everyone else joins and helps it catch up. On a tie the leader from Groups hosts.
     *   Also fixes quests that only work in a game made by someone who hasn't done them (Khalim's Will orb).
     *   false = the leader from Groups always hosts.
     */
    HostRotation: true,

    /**
     * @desc - when the leader pops to town in the middle of a quest, followers hold at its portal in the field
     *   (clearing anything close) instead of following it to town. The leader goes back through its own portal
     *   when it returns to the same area; anywhere else it drops a fresh portal for them.
     */
    HoldAtPortal: true,

    /**
     * @desc - minutes followers keep waiting at the leader's portal while it is in town (town trip / TownChicken)
     *   before they give up and go find it
     */
    PortalHoldMinutes: 10,

    /**
     * @desc - seconds the runner (whoever is running the script - usually the leader) waits for its helpers when it
     *   arrives by waypoint/portal or comes back from town, and for Battle Orders. Fights anything that comes close
     *   while it waits. 0 = don't regroup.
     */
    GatherWait: 30,

    /**
     * @desc - seconds the runner waits when it walks into a boss / quest area (Den, Catacombs 4, Durance 3, Chaos...)
     */
    BossWait: 45,

    /**
     * @desc - if anyone in the party has Battle Orders (barb), they cast it when the party regroups and the
     *   leader waits until everyone has the buff
     */
    BattleOrders: true,

    /**
     * @desc - hard cap on game length in party mode (minutes). The party ends the game after this.
     */
    MaxGameMinutes: 150,

    /**
     * @desc - extra logging to the D2BotNG console for every party step
     */
    Debug: false,
  };
})(module);
