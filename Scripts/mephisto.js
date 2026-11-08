/**
*  @filename    mephisto.js
*  @author      kolton, theBGuy
*  @desc        mephisto quest
*  @patch       D2BotNG local — pre-boss thawing/antidote prep BEFORE first
*               Durance travel so we do not WP Durance L3 → Act 4 mid-run
*               solely for cold res (SCL-SORC Nov 5, 2026 ~15:20 America/Chicago
*               native Game.exe crash after buyPots saw coldRes -31).
*               Stock Meph kill / council / red-portal behavior kept.
*
*/

/**
 * Pure helper (also used by offline Node tests).
 * @param {{coldRes?:number, poisonRes?:number}} meLike
 * @returns {{needed:boolean, thawing:boolean, antidote:boolean}}
 */
function mephistoResPrep(meLike) {
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

function mephisto () {
  const killCouncil = function () {
    let coords = [17600, 8125, 17600, 8015, 17643, 8068];

    for (let i = 0; i < coords.length; i += 2) {
      [coords[i], coords[i + 1]].distance > 60 && Pather.moveNear(coords[i], coords[i + 1], 60);
      if ([coords[i], coords[i + 1]].mobCount({ range: 30 }) === 0) continue;
      Pather.moveTo(coords[i], coords[i + 1]);
      Attack.clearList(Attack.getMob([sdk.monsters.Council1, sdk.monsters.Council2, sdk.monsters.Council3], 0, 40));
    }

    return true;
  };

  Town.doChores(false, { fullChores: true });

  // Pre-boss res prep BEFORE Durance — fullChores alone can skip buyPots
  // (SCL-SORC Nov 5: chores healed/shopped in Act 4 then returned to Docktown
  // without thawing; mid-script town from L3 for coldRes -31 preceded native crash).
  {
    const prep = mephistoResPrep(me);

    if (prep.needed) {
      console.log("ÿc8Kolbot-SoloPlayÿc0: mephisto pre-boss res prep (thawing="
        + prep.thawing + ", antidote=" + prep.antidote + ")");
      Town.doChores(null, { thawing: prep.thawing, antidote: prep.antidote });
    }
  }

  myPrint("starting mephisto");

  Pather.checkWP(sdk.areas.DuranceofHateLvl2, true)
    ? Pather.useWaypoint(sdk.areas.DuranceofHateLvl2)
    : Pather.getWP(sdk.areas.DuranceofHateLvl2);
  Precast.doPrecast(true);
  const oldCPRange = Config.ClearPath.Range;
  const canTele = Pather.canTeleport();
  try {
    canTele && (Config.ClearPath.Range = 0);
    canTele
      ? Pather.moveToExit(sdk.areas.DuranceofHateLvl3, true, false)
      : Pather.clearToExit(sdk.areas.DuranceofHateLvl2, sdk.areas.DuranceofHateLvl3, true);
  } finally {
    oldCPRange !== Config.ClearPath.Range && (Config.ClearPath.Range = oldCPRange);
  }
  
  if (!me.inArea(sdk.areas.DuranceofHateLvl3)) {
    console.log("ÿc8Kolbot-SoloPlayÿc0: Failed to move to mephisto");
    return false;
  }

  // Rare mid-run fallback if pots expired / prep missed — stock portal return.
  // After pre-boss prep this should almost never fire.
  if (me.coldRes < 75 || me.poisonRes < 75) {
    console.log("ÿc8Kolbot-SoloPlayÿc0: mephisto mid-run res fallback (pre-boss prep should have covered this)");
    Town.doChores(null, { thawing: me.coldRes < 75, antidote: me.poisonRes < 75 });
    // Re-enter portal
    Pather.usePortal(sdk.areas.DuranceofHateLvl3, me.name);
    Precast.doPrecast(true);
  }

  const oldPickRange = Config.PickRange;
  const oldUseMerc = Config.MercWatch;

  if (me.mephisto) {
    // activate bridge
    Pather.moveTo(17587, 8069);
    delay(400);
  }

  Pather.moveTo(17563, 8072);
  Attack.killTarget("Mephisto");

  // Reset to normal value
  Config.MercWatch !== oldUseMerc && (Config.MercWatch = oldUseMerc);
  Config.PickRange !== oldPickRange && (Config.PickRange = oldPickRange);
  
  Pickit.pickItems();
  me.mephisto && !me.hell && killCouncil();

  Pather.moveTo(17581, 8070);
  delay(250 + me.ping * 2);
  Pather.useUnit(sdk.unittype.Object, sdk.objects.RedPortalToAct4, sdk.areas.PandemoniumFortress);
  Misc.poll(function () {
    return me.inArea(sdk.areas.PandemoniumFortress);
  }, 1000, 30);

  while (!me.gameReady) {
    delay(40);
  }

  return me.inArea(sdk.areas.PandemoniumFortress);
}
