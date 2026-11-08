/**
*  @filename    diablo.js
*  @author      theBGuy
*  @desc        Diablo
*  @patch       D2BotNG local — (1) retry Infector after seal-kill failure before
*               diabloPrep (SCL-SORC Nov 4 Failed to kill Infector → Diablo not
*               found); (2) pre-boss thawing/antidote prep BEFORE first River of
*               Flame / Chaos travel so we do not town mid-run after Chaos
*               entrance solely for cold/poison res (same mid-run Act WP class
*               as SCL-SORC Nov 5, 2026 Mephisto crash after buyPots saw
*               coldRes -31). Stock seal / diabloPrep / pwnDia / changeAct kept.
*
*/

/**
 * Pure helper (also used by offline Node tests).
 * Same thresholds as Mephisto/Andariel/Baal — thawing if coldRes<75,
 * antidote if poisonRes<75; missing/non-finite default to 0.
 * @param {{coldRes?:number, poisonRes?:number}} meLike
 * @returns {{needed:boolean, thawing:boolean, antidote:boolean}}
 */
function diabloResPrep(meLike) {
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

// todo: clean this up, listen for lights game packet while opening/checking seals

/** @returns {boolean} Always true */
function diablo () {
  // Start Diablo Quest
  const diabloPrep = function () {
    let tick = getTickCount();
    let decoyDuration = (me.amazon ? Skill.getDuration(sdk.skills.Decoy) : 0);

    while (getTickCount() - tick < 17500) {
      me.getMobCount(20) > 1 && Attack.clear(20);
      if (getTickCount() - tick >= 8000) {
        switch (me.classid) {
        case sdk.player.class.Amazon:
          if (me.getSkill(sdk.skills.Decoy, sdk.skills.subindex.SoftPoints)) {
            let decoy = Game.getMonster(sdk.summons.Dopplezon);

            if (!decoy || (getTickCount() - tick >= decoyDuration)) {
              Skill.cast(sdk.skills.Decoy, sdk.skills.hand.Right, 7793, 5293);
            }
          }

          break;
        case sdk.player.class.Sorceress:
          if ([sdk.skills.Meteor, sdk.skills.Blizzard, sdk.skills.FrozenOrb, sdk.skills.FireWall]
            .includes(Config.AttackSkill[1])) {
            Skill.cast(Config.AttackSkill[1], sdk.skills.hand.Right, 7793 + rand(-1, 1), 5293);
          }

          delay(500);

          break;
        case sdk.player.class.Paladin:
          Skill.setSkill(Config.AttackSkill[2]);
          Config.AttackSkill[1] === sdk.skills.BlessedHammer && Skill.cast(Config.AttackSkill[1], sdk.skills.hand.Left);

          break;
        case sdk.player.class.Druid:
          if ([sdk.skills.Tornado, sdk.skills.Fissure, sdk.skills.Volcano].includes(Config.AttackSkill[3])) {
            Skill.cast(Config.AttackSkill[1], sdk.skills.hand.Right, 7793 + rand(-1, 1), 5293);

            break;
          }

          delay(500);

          break;
        case sdk.player.class.Assassin:
          if (Config.UseTraps) {
            let trapCheck = ClassAttack[me.classid].checkTraps({ x: 7793, y: 5293 });
            trapCheck
              && ClassAttack[me.classid].placeTraps({ x: 7793, y: 5293, classid: sdk.monsters.Diablo }, trapCheck);
          }

          Config.AttackSkill[1] === sdk.skills.ShockWeb
            && Skill.cast(Config.AttackSkill[1], sdk.skills.hand.Right, 7793, 5293);

          delay(500);

          break;
        default:
          delay(500);
        }
      } else {
        delay(500);
      }

      if (Game.getMonster(sdk.monsters.Diablo)) {
        return true;
      }
    }

    return false;
  };

  // START
  Town.doChores(false, { fullChores: true });

  // Pre-boss res prep BEFORE River of Flame / Chaos — fullChores alone can
  // skip buyPots; stock bought thawing/antidote only AFTER Chaos entrance
  // (forces mid-run town + portal return). Same mid-run Act WP class as
  // Mephisto/Andariel/Baal/Duriel prep already shipped.
  {
    const prep = diabloResPrep(me);

    if (prep.needed) {
      console.log("ÿc8Kolbot-SoloPlayÿc0: diablo pre-boss res prep (thawing="
        + prep.thawing + ", antidote=" + prep.antidote + ")");
      Town.doChores(null, { thawing: prep.thawing, antidote: prep.antidote });
    }
  }

  myPrint("starting diablo");

  Pather.checkWP(sdk.areas.RiverofFlame, true)
    ? Pather.useWaypoint(sdk.areas.RiverofFlame)
    : Pather.getWP(sdk.areas.RiverofFlame);
  Precast.doPrecast(true);

  let attempts = 0;
  
  while ([7790, 5544].distance > 15 && attempts < 5) {
    myPrint("Moving to Chaos Sanctuary Entrance :: Attempt: " + attempts);
    Pather.moveTo(7790, 5544);
    attempts++;
  }

  // Rare mid-run fallback if pots expired / prep missed — stock portal return.
  // After pre-boss prep this should almost never fire.
  if (me.coldRes < 75 || me.poisonRes < 75) {
    console.log("ÿc8Kolbot-SoloPlayÿc0: diablo mid-run res fallback (pre-boss prep should have covered this)");
    Town.doChores(null, { thawing: me.coldRes < 75, antidote: me.poisonRes < 75 });
    Town.move("portalspot");
    Pather.usePortal(sdk.areas.ChaosSanctuary, me.name);
    Misc.poll(function () {
      if (me.inArea(sdk.areas.ChaosSanctuary)) {
        console.log("Returned to chaos");
        return true;
      }
      return false;
    }, 500, 100);
  }

  Common.Diablo.initLayout();

  const oldCP = Object.assign({}, Config.ClearPath);
  const oldBP = Config.BossPriority;

  try {
    !me.diablo && me.barbarian && (Config.BossPriority = true);

    switch (true) {
    case (Check.brokeAf(false)):
      break;
    case (me.diffCompleted && Pather.canTeleport()):
      let cLvl = me.charlvl;
      if ((me.normal && cLvl > 28) || (me.nightmare && cLvl > 65)) {
        // try running fast diablo - may neeed work
        Config.Diablo.Fast = true;
        Config.ClearPath.Range = 15;
        Config.ClearPath.Spectype = 0xF; // skip normal mobs
        console.debug("CP Settings: ", Config.ClearPath);
      }
    }

    Common.Diablo.vizierSeal();
    Common.Diablo.seisSeal();
    Common.Diablo.infectorSeal();
  } catch (e) {
    console.error(e);
    // Harden: if Infector (or earlier seal) failed, try Infector once more before diabloPrep.
    // Seals already open are no-ops inside openSeal; haveKilled short-circuits a dead Infector.
    try {
      const infName = getLocaleString(sdk.locale.monsters.InfectorofSouls);
      if (!Attack.haveKilled(infName)) {
        console.log("ÿc8Kolbot-SoloPlayÿc0: Retrying Infector after seal error.");
        Common.Diablo.infectorSeal();
      }
    } catch (e2) {
      console.error(e2);
    }
  } finally {
    oldCP.Range !== Config.ClearPath.Range && (Object.assign(Config.ClearPath, oldCP));
    oldBP !== Config.BossPriority && (Config.BossPriority = oldBP);
  }

  try {
    if (!Check.currentBuild().caster || (Skill.getRange(Config.AttackSkill[1]) < 13)) {
      Messaging.sendToScript(SoloEvents.filePath, "addDiaEvent");
    }

    (me.sorceress || me.necromancer || me.assassin)
      ? Pather.moveNear(7792, 5292, 37)
      : Pather.moveTo(7788, 5292, 3, 30);
    
    diabloPrep();
    let theD = Game.getMonster(sdk.monsters.Diablo);

    if (!theD) {
      console.log("ÿc8Kolbot-SoloPlayÿc0: Diablo not found. Checking seal bosses.");
      try {
        Common.Diablo.vizierSeal();
        Common.Diablo.seisSeal();
        Common.Diablo.infectorSeal();
      } catch (e) {
        //
      }

      (me.sorceress || me.necromancer || me.assassin)
        ? Pather.moveNear(7792, 5292, 37)
        : Pather.moveTo(7788, 5292, 3, 30);
      diabloPrep();
    }

    !Attack.pwnDia() && Attack.killTarget(sdk.monsters.Diablo);
    Pickit.pickItems();
  } catch (e) {
    //
  } finally {
    Messaging.sendToScript(SoloEvents.filePath, "removeDiaEvent");
  }

  if (me.classic) return true;

  try {
    Pather.changeAct();
  } catch (err) {
    Town.npcInteract("tyrael");
    me.cancel();
    delay(500);
    Pather.useUnit(sdk.unittype.Object, 566, 109);
  }

  return true;
}
