/**
*  @filename    andariel.js
*  @author      theBGuy
*  @desc        andariel quest.
*  @patch       D2BotNG local — pre-boss thawing/antidote prep BEFORE first
*               Catacombs travel so we do not portal Catacombs L4 → town mid-run
*               solely for poison/cold res (same mid-run Act WP class as SCL-SORC
*               Nov 5, 2026 Mephisto crash after buyPots saw coldRes -31).
*               Stock Andy kill / questBug / Normal act-change kept.
*
*/

/**
 * Pure helper (also used by offline Node tests).
 * Andariel is primarily poison; also thawing when coldRes is low.
 * @param {{coldRes?:number, poisonRes?:number}} meLike
 * @returns {{needed:boolean, thawing:boolean, antidote:boolean}}
 */
function andarielResPrep(meLike) {
  const coldRaw = meLike && meLike.coldRes;
  const poisonRaw = meLike && meLike.poisonRes;
  const cold = (typeof coldRaw === "number" && isFinite(coldRaw)) ? coldRaw : 0;
  const poison = (typeof poisonRaw === "number" && isFinite(poisonRaw)) ? poisonRaw : 0;
  const thawing = cold < 75;
  const antidote = poison < 75;

  return {
    needed: thawing || antidote,
    thawing: thawing,
    antidote: antidote
  };
}

// todo: clean this up
function andariel () {
  Town.doChores(false, { fullChores: true });

  // Pre-boss res prep BEFORE Catacombs — stock only bought antidote/thawing
  // AFTER arriving in Catacombs L4 (forces mid-run town + portal return).
  {
    const prep = andarielResPrep(me);

    if (prep.needed) {
      console.log("ÿc8Kolbot-SoloPlayÿc0: andariel pre-boss res prep (thawing="
        + prep.thawing + ", antidote=" + prep.antidote + ")");
      Town.doChores(null, { thawing: prep.thawing, antidote: prep.antidote });
    }
  }

  myPrint("starting andy");

  if (me.normal && Misc.checkQuest(sdk.quest.id.SistersToTheSlaughter, sdk.quest.states.ReqComplete)) {
    Pather.changeAct();

    return true;
  }

  let questBug = (!me.normal && !me.andariel);

  Pather.checkWP(sdk.areas.CatacombsLvl2, true) ? Pather.useWaypoint(sdk.areas.CatacombsLvl2) : Pather.getWP(sdk.areas.CatacombsLvl2);
  Precast.doPrecast(true);
  Pather.moveToExit([sdk.areas.CatacombsLvl3, sdk.areas.CatacombsLvl4], true);

  // Rare mid-run fallback if pots expired / prep missed — stock portal return.
  // After pre-boss prep this should almost never fire.
  if (me.poisonRes < 75) {
    console.log("ÿc8Kolbot-SoloPlayÿc0: andariel mid-run res fallback (pre-boss prep should have covered this)");
    Town.doChores(true, { thawing: me.coldRes < 75, antidote: true });
    Pather.usePortal(sdk.areas.CatacombsLvl4, me.name);
  }

  Precast.doPrecast(true);

  let oldPickRange = Config.PickRange;
  
  if (questBug) {
    Config.PickRange = -1;
    me.barbarian && (Config.FindItem = false);
  } else {
    Config.PickRange = 5; // Only pick what is directly around me
  }

  let coords = [
    {x: 22572, y: 9635}, {x: 22554, y: 9618},
    {x: 22542, y: 9600}, {x: 22572, y: 9582},
    {x: 22554, y: 9566}
  ];

  if (Pather.useTeleport()) {
    Pather.moveTo(22571, 9590);
  } else {
    while (coords.length) {
      let andy = Game.getMonster(sdk.monsters.Andariel);

      if (andy && andy.distance < 15) {
        break;
      }

      Pather.moveToUnit(coords[0]);
      Attack.clearClassids(sdk.monsters.DarkShaman1);
      coords.shift();
    }
  }
  
  Config.MercWatch = false;

  Attack.killTarget("Andariel");

  if (questBug) {
    Config.TownCheck = false;
    Config.MercWatch = false;
    Config.HealStatus = false;
    Config.UseMerc = false;
    Config.TownHP = 0;
    Config.TownMP = 0;
    Config.PickRange = -1;
    Misc.townEnabled = false;
    CharData.updateConfig();

    if (Pather.changeAct()) {
      delay(2000 + me.ping);

      // Now check my area
      if (me.act === 2) {
        // Act change sucessful, Andy has been bugged
        // let result = (Misc.checkQuest(sdk.quest.id.SistersToTheSlaughter, 15) ? "Sucessful" : "Unsucessful");
        // myPrint("Andy bugged was " + result);
        myPrint("Bugging andy");
        scriptBroadcast("quit");
      }
    }
  }

  delay(2000 + me.ping); // Wait for minions to die.
  Config.PickRange = oldPickRange; // Reset to normal value
  Pickit.pickItems();
  Config.MercWatch = true;

  !me.andariel && Pather.changeAct();

  return true;
}
