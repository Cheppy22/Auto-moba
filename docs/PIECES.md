# Pieces design sheet (chess variant, 2026-10-08)

The five chess pieces as characters: what each one is for, its three styles, what it gains at each rank, the two forks, and the item build for each path. Also the Gambit numbers and four example team doctrines. This sheet belongs to [CHESS.md](CHESS.md). The numbers live in `content/pieces/*.json` and `content/gambits.json`, and the tables below were generated from those files. If they disagree, the JSON is right; regenerate this sheet.

Status: **first pass, untuned.** The balance run (800 matches) has not been done yet. Aim: every style wins 45–55% of its matches against the other styles of the same piece.

## The 15 styles at a glance

| Piece  | Style         | One line                                                                                      |
| ------ | ------------- | --------------------------------------------------------------------------------------------- |
| King   | Warlord       | Front-line brawler whose War Drums make nearby pieces and pawns hit harder.                   |
| King   | Sovereign     | The only ranged King: shields the court from the back and makes allies take 6% less damage.   |
| King   | Usurper       | Selfish drain duelist: lifesteal, saps enemy strength, grows with each piece he kills.        |
| Queen  | Regent        | Area mage; every wave she clears shortens her cooldowns.                                      |
| Queen  | Duelist       | Melee carry who locks onto one piece and ramps up the longer the duel lasts.                  |
| Queen  | Huntress      | Sniper with the longest range in the game; kills reset her.                                   |
| Rook   | Bastion       | A wall: enemies near him hit softer and get stuck; his lane does not fall.                    |
| Rook   | Battering Ram | Strips the armor of everything around him, structures included, and knocks Bastions down.     |
| Rook   | Vanguard      | Starts fights from 240 away, staggers the target, and allies who follow him hit harder.       |
| Bishop | Light         | The healer: group heals, a regen halo that also heals pawns, and small heals that never stop. |
| Bishop | Shadow        | Damage over time from the far diagonal; burns keep ticking after she retreats.                |
| Bishop | Zealot        | Melee battle priest whose every hit heals the allies around her.                              |
| Knight | Lancer        | Assassin: a 200-long lance charge; each kill readies the next one.                            |
| Knight | Errant        | Jungler and split pusher: fastest out of combat, strongest camp and structure damage.         |
| Knight | Paladin       | Leaps to the most wounded ally instead of an enemy and shields it; weakens whoever he hits.   |

## How a piece is put together

1. **Base kit.** Stats, three base abilities and a piece passive, shared by every style.
2. **Style** (picked at setup). It adds the **signature skill** (the 4th ability, cast first when ready), a **stat tilt** and one or two **passives**. Four styles (Sovereign, Duelist, Huntress, Zealot) also move attack range, so the piece fights at a different distance.
3. **Rank bonuses** at Ranks 2, 3, 5, 6 and 7 are small and automatic: one ability tweak or one stat each.
4. **Forks** at Ranks 4 and 8 are a choice between two directions (reach or sustain, team or self, push or gank). Each option carries a small stat in its own direction, so the AI picks the option that matches the piece's build path (see "AI picks" in each fork table: O/D/U = Offense/Defense/Utility path, A or B).
5. **Build path** (picked at setup, changeable during Adjourn): six items in buy order. An arrow from a tier 2 item to its Relic means it is upgraded later, so the final kit is usually 4–5 items; once the list is done the piece fills the rest of its slots on its own.

**Words used below:**

- **Stagger** means move speed and attack speed cut by 90% (to the engine floors of 12 and 0.2) for the stated time. The engine has no stun, so this is the stun.
- **Aura** means "while near this piece", refreshed every second. Ally auras also work on **pawns, pawnlings and your own structures**; enemy auras also work on **Bastions and the Throne**.
- **(12s)** after a rule is its cooldown.
- "Piece" means one of the ten chess pieces, never a pawn or a camp.

## King: Commander

A crowned old commander who never runs and never falls easily. He is the reason the team fights well together, and the one piece the team cannot afford to lose (his death puts the team in Check).

- **Job:** Commander. Tough, slow, low damage; auras and group skills that lift every piece and pawn near him.
- **Move flavor:** One step at a time: the slowest piece (43), and his strike is a short 35 step. Castling with the Rook comes from the Castle gambit.
- **AI:** defender, steadfast. Melee by default.

| Health | Regen | Armor | Resist | Blade | Attack speed | Soul | Move | Range |
| ------ | ----- | ----- | ------ | ----- | ------------ | ---- | ---- | ----- |
| 1450   | 3.5   | 34    | 30     | 52    | 0.8          | 30   | 43   | 28    |

**Why these numbers:** Health and resist second only to the Rook, so he survives being focused; Blade 52 is the lowest melee damage. He has both Blade and Soul (30) so his heals and shields scale with either build. The Royal Presence regen aura works on pawns too, so the lane he stands in holds.

**Base abilities** (every style has these):

| #   | Ability     | Cooldown | Aim           | Reach      | What it does                                                                                                                      |
| --- | ----------- | -------- | ------------- | ---------- | --------------------------------------------------------------------------------------------------------------------------------- |
| 1   | One Step    | 7s       | one enemy     | range 70   | Takes one step (35) onto an enemy and strikes with the scepter for 30 + 75% Blade + 30% Soul damage.                              |
| 2   | Rally       | 18s      | allies around | radius 170 | When a piece within 170 is below 80% health, heals every piece there for 45 + 20% Blade + 40% Soul and speeds them up 12% for 3s. |
| 3   | Royal Guard | 15s      | self          | radius 130 | With an enemy piece within 130, raises a guard of 90 + 50% Blade + 50% Soul shield for 4s.                                        |

**Piece passives:** **Royal Presence**: allied pieces and pawns within 160 regenerate +3 health per second. **Steadfast Crown**: dropping below 30% health raises a 150 + 50% Blade + 50% Soul shield for 4s (90s).

### King · Warlord

Leads from the front. Everyone near him, pawns included, hits harder; he opens enemies up for his court. Plays in front of his lane. The AI should treat him as a brawler; the lane he is in pushes hardest because pawns there hit 10–15% harder.

- **Signature: Banner of War** (26s, allies around, radius 190). Once the fighting starts (a piece within 190 below 90% health), every piece there deals 15% more Blade damage and attacks 15% faster for 6s.
- **Stat tilt:** +15% Blade damage, +6 armor, −4 resist, +3 move speed, −20% Soul power.
- **Passives:** **War Drums**: allied pieces and pawns within 170 deal +6 Blade damage. **Front Rank**: his hit on a piece strips 8 armor for 4s (6s).

| Rank | Bonus          | Effect                              |
| ---- | -------------- | ----------------------------------- |
| 2    | Drilled Ranks  | Banner of War reaches 15% farther.  |
| 3    | Iron Crown     | +6 armor.                           |
| 5    | Warhorn        | Banner of War recharges 15% faster. |
| 6    | Heavy Scepter  | One Step hits 25% harder.           |
| 7    | Old Campaigner | +8% max health.                     |

| Fork   | Option A                                                                                                               | Option B                                                                                                              | AI picks (O/D/U) |
| ------ | ---------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------- | ---------------- |
| Rank 4 | **Forced March**: Pieces and pawns within 170 move +8 faster. The court rotates and chases as one. Also +2 move speed. | **Blood Oath**: Each enemy piece he kills heals every allied piece within 190 for 8% max health. Also +4% max health. | A/B/A            |
| Rank 8 | **Conquest**: Allies within 170 attack 10% faster. Pure team damage. Also +4% Blade damage.                            | **Last Stand**: Below 35% health he takes 40% less damage for 5s (60s). He holds the line himself. Also +5 armor.     | A/B/A            |

| Path    | Buy order (bold = Relic)                                                                                                      | Final kit                       |
| ------- | ----------------------------------------------------------------------------------------------------------------------------- | ------------------------------- |
| Offense | Wanderer's Boots → Cogged Edge → Boiler Heart → **Soot Reaver** → Bloodletter Hook → **Vorpal Blade**                         | 5 items: 3 Mind, 2 Body         |
| Defense | Wanderer's Boots → Boiler Heart → Cogged Edge → **Furnace Bastion** → Mender's Ledger → **Pocket Vault Shell**                | 5 items: 1 Mind, 4 Body         |
| Utility | Wanderer's Boots → Pocket Reliquary → Cogged Edge → Shuttered Door → **Furnished Pocket Dimension** → **Hundred-Hand Ledger** | 5 items: 2 Mind, 1 Body, 2 Soul |

### King · Sovereign

Rules from behind the line with a ranged scepter. Shields the court and makes allies near him take less damage. Scales with Soul. The only ranged King: +70 range turns him into a backline caster. He never wants to be hit first; his value is shields and the 6% damage reduction field.

- **Signature: Aegis of the Crown** (20s, allies around, radius 200). When a piece within 200 is below 75% health, shields every piece there for 70 + 20% Blade + 70% Soul for 4s.
- **Stat tilt:** +70 attack range, +22 Soul power, +8% cooldown reduction, −15% Blade damage, −1 move speed.
- **Passives:** **Royal Mandate**: allied pieces and pawns within 170 take 6% less damage. **Divine Right**: when an enemy piece hits him, allies within 170 gain a 40 + 40% Soul shield for 3s (12s).

| Rank | Bonus        | Effect                                   |
| ---- | ------------ | ---------------------------------------- |
| 2    | Gilded Aegis | Aegis of the Crown shields 15% more.     |
| 3    | Court Mage   | +12 Soul power.                          |
| 5    | Swift Decree | Aegis of the Crown recharges 15% faster. |
| 6    | Praetorians  | Royal Guard shields 30% more.            |
| 7    | Long Reign   | +10 resist and +5% max health.           |

| Fork   | Option A                                                                             | Option B                                                                                                                                              | AI picks (O/D/U) |
| ------ | ------------------------------------------------------------------------------------ | ----------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------- |
| Rank 4 | **Wide Dominion**: Aegis of the Crown covers 25% more ground: shield the whole team. | **Restoration**: Every 6s, allies within 170 heal 15 + 20% Soul. Slow, steady sustain instead of bursts. Also +6% max health, +2 health regeneration. | A/B/A            |
| Rank 8 | **Divine Sovereign**: Aegis of the Crown recharges 15% faster.                       | **Royal Wrath**: Every 5s the nearest enemy piece within 220 is struck for 30 + 40% Soul damage. He stops being harmless. Also +15% Soul power.       | B/A/A            |

| Path    | Buy order (bold = Relic)                                                                                                            | Final kit               |
| ------- | ----------------------------------------------------------------------------------------------------------------------------------- | ----------------------- |
| Offense | Wanderer's Boots → Séance Prism → Ward-Bell Cuirass → **Eternal Wick** → Pocket Reliquary → **Locked Cabinet of Wishes**            | 5 items: 2 Body, 3 Soul |
| Defense | Wanderer's Boots → Ward-Bell Cuirass → Pocket Reliquary → Mender's Ledger → **Pocket Vault Shell** → **Furnished Pocket Dimension** | 4 items: 3 Body, 1 Soul |
| Utility | Wanderer's Boots → Pocket Reliquary → Shuttered Door → **Furnished Pocket Dimension** → Séance Prism → **Eternal Wick**             | 4 items: 1 Body, 3 Soul |

### King · Usurper

A pretender who fights for himself. Drains life with every blow, saps the strength of enemies around him and grows with each crown he takes. No team buffs beyond the base regen aura. He is a self-healing duelist who gets stronger with each piece he kills, a King who wins his own lane.

- **Signature: Seize the Crown** (18s, enemies around, radius 120). Hits every enemy within 120 for 40 + 30% Blade + 60% Soul damage and steals 15% of their Blade damage and Soul power for 4s. Needs 2 enemies.
- **Stat tilt:** +5% max health, +10% Blade damage, +10 Soul power, +0.1 attack speed, −4 armor.
- **Passives:** **Stolen Tithe**: heals for 18% of his attack damage. **Claimed Crowns**: each enemy piece he kills heals him 20% max health and grants +6 Blade damage for 2 minutes (up to 5 times).

| Rank | Bonus            | Effect                                         |
| ---- | ---------------- | ---------------------------------------------- |
| 2    | Greedy Hands     | Seize the Crown reaches 15% wider.             |
| 3    | Pretender's Grip | Enemies within 150 lose 4 health regeneration. |
| 5    | Bloody Scepter   | One Step hits 30% harder.                      |
| 6    | Seize Again      | Seize the Crown recharges 15% faster.          |
| 7    | Crowned in Blood | +8% Blade damage.                              |

| Fork   | Option A                                                                                                   | Option B                                                                                                           | AI picks (O/D/U) |
| ------ | ---------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------ | ---------------- |
| Rank 4 | **Tyrant**: Every 3rd hit on a piece adds 20 + 40% Soul damage. More kill pressure. Also +4% Blade damage. | **Leech Lord**: Heals for a further 10% of attack damage. He outlasts anyone in a long fight. Also +4% max health. | A/B/A            |
| Rank 8 | **Regicide**: Hits on a piece below 12% health execute it. Also +4% Blade damage.                          | **Usurper's Luck**: Once per life, lethal damage leaves him at 1 health and heals 25% max health. Also +4 armor.   | A/B/A            |

| Path    | Buy order (bold = Relic)                                                                                                                       | Final kit                       |
| ------- | ---------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------- |
| Offense | Wanderer's Boots → Bloodletter Hook → Cogged Edge → **Soot Reaver** → Duelist's Form → **Vorpal Blade**                                        | 4 items: 3 Mind, 1 Body         |
| Defense | Wanderer's Boots → Boiler Heart → Bloodletter Hook → **Furnace Bastion** → Ward-Bell Cuirass → **Undying Larder**                              | 4 items: 1 Mind, 3 Body         |
| Utility | Wanderer's Boots → Pocket Reliquary → Bloodletter Hook → Wishgranter's Receipt → **Furnished Pocket Dimension** → **Locked Cabinet of Wishes** | 4 items: 1 Mind, 1 Body, 2 Soul |

## Queen: Carry

The most powerful piece on the board, and the most fragile at the start. Every rank makes her more dangerous; protect her early and she ends games.

- **Job:** Carry. Weak in Ranks 1–3, the biggest per-rank bonuses in the game from Rank 5.
- **Move flavor:** Long dashes in any direction: Royal Lunge (90) in, Withdraw (100) and Any Direction (80) out. The fastest piece after the Knight (52).
- **AI:** attacker, opportunist. Ranged by default.

| Health | Regen | Armor | Resist | Blade | Attack speed | Soul | Move | Range |
| ------ | ----- | ----- | ------ | ----- | ------------ | ---- | ---- | ----- |
| 860    | 2     | 20    | 20     | 56    | 0.95         | 36   | 52   | 80    |

**Why these numbers:** Lowest health (860) and armor of the five so she dies to early focus. Base range 80 is deliberately in between: each style moves it (melee 24, Regent 105, Huntress 135). Her rank bonuses carry +10–12% damage at Ranks 3 and 7, where other pieces get +6–8% or utility, so she scales hardest.

**Base abilities** (every style has these):

| #   | Ability         | Cooldown | Aim            | Reach                | What it does                                                                              |
| --- | --------------- | -------- | -------------- | -------------------- | ----------------------------------------------------------------------------------------- |
| 1   | Royal Lunge     | 8s       | one enemy      | range 150            | Dashes 90 to an enemy and strikes for 30 + 70% Blade + 25% Soul damage.                   |
| 2   | Sweeping Decree | 10s      | blast at range | range 140, radius 70 | Blasts enemies within 70 of a target up to 140 away for 35 + 25% Blade + 55% Soul damage. |
| 3   | Withdraw        | 14s      | one enemy      | range 90             | Below 60% health, dashes 100 away from a close enemy and slows it 30% for 2s.             |

**Piece passives:** **Any Direction**: when a piece hits her below 50% health, she dashes 80 away from it (14s).

### Queen · Regent

An area mage who rules the battlefield from range. Every wave she clears brings her spells back sooner. Plays like the old area mages: stands back, clears waves with Decree of Ruin and Sweeping Decree, and the Mandate passive makes every wave kill shorten her cooldowns.

- **Signature: Decree of Ruin** (20s, blast at range, range 170, radius 110). Calls ruin on a spot up to 170 away: enemies within 110 take 75 + 90% Soul damage and lose 12 resist for 4s. Needs 2 enemies.
- **Stat tilt:** +26 Soul power, +25 attack range, −15% Blade damage, +5% cooldown reduction.
- **Passives:** **Mandate**: every kill (pawnlings and camps too) cuts her cooldowns by 0.5s.

| Rank | Bonus         | Effect                                         |
| ---- | ------------- | ---------------------------------------------- |
| 2    | Wider Decree  | Decree of Ruin covers 15% more ground.         |
| 3    | Royal Library | +10% Soul power.                               |
| 5    | Edict         | Sweeping Decree hits 30% harder and 20% wider. |
| 6    | Swift Edicts  | Decree of Ruin recharges 15% faster.           |
| 7    | Absolute Rule | +12% Soul power.                               |

| Fork   | Option A                                                                                                                     | Option B                                                                                                                                                    | AI picks (O/D/U) |
| ------ | ---------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------- |
| Rank 4 | **Distant Throne**: Decree of Ruin reaches 35% farther and her attacks +15 range. Safer, from the back. Also +5% max health. | **Cataclysm**: Decree of Ruin hits 25% harder and 10% wider. More damage, same danger.                                                                      | B/A/A            |
| Rank 8 | **Ruin Without End**: Each enemy piece she kills cuts her cooldowns by 8s. Chain picks. Also +6% Soul power.                 | **Queen of Ashes**: Every 4s in combat, enemies within 160 take 20 + 30% Soul damage. Constant burn, but she has to stand closer. Also +6 armor, +6 resist. | A/B/B            |

| Path    | Buy order (bold = Relic)                                                                                                         | Final kit               |
| ------- | -------------------------------------------------------------------------------------------------------------------------------- | ----------------------- |
| Offense | Wanderer's Boots → Séance Prism → Wishgranter's Receipt → **Eternal Wick** → Pocket Reliquary → **Locked Cabinet of Wishes**     | 4 items: 1 Body, 3 Soul |
| Defense | Wanderer's Boots → Pocket Reliquary → Ward-Bell Cuirass → **Furnished Pocket Dimension** → Séance Prism → **Pocket Vault Shell** | 4 items: 2 Body, 2 Soul |
| Utility | Wanderer's Boots → Shuttered Door → Séance Prism → **Eternal Wick** → Pocket Reliquary → **Furnished Pocket Dimension**          | 4 items: 1 Body, 3 Soul |

### Queen · Duelist

Puts the crown down and picks up a sword: a melee carry who locks onto one piece and gets faster and deadlier the longer the duel lasts. Changes the Queen into a melee fighter: +220 health and +10 armor to survive in front, a lunge onto one piece, and a damage stack that rewards staying on that piece.

- **Signature: En Garde** (18s, one enemy, range 130). Lunges 90 at an enemy piece, cuts for 50 + 100% Blade damage and cuts its armor by 20% for 5s.
- **Stat tilt:** −56 attack range, +220 max health, +10 armor, +6 resist, +12% Blade damage, +0.1 attack speed, −40% Soul power.
- **Passives:** **Crescendo**: each hit on a piece grants +3% Blade damage for 4s, up to 6 times. **Parry**: when a piece hits her, she gains a 40 + 50% Blade shield for 2s (8s).

| Rank | Bonus       | Effect                            |
| ---- | ----------- | --------------------------------- |
| 2    | Footwork    | +4 move speed.                    |
| 3    | Sharpened   | En Garde hits 20% harder.         |
| 5    | Quick Lunge | Royal Lunge recharges 20% faster. |
| 6    | Riposte     | +8 armor.                         |
| 7    | Blade Royal | +12% Blade damage.                |

| Fork   | Option A                                                                                            | Option B                                                                                                                | AI picks (O/D/U) |
| ------ | --------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------- | ---------------- |
| Rank 4 | **Flèche**: En Garde reaches 30% farther: she picks her duel from across the fight.                 | **Second Breath**: Heals for 12% of her attack damage: she wins the long duels instead. Also +150 max health, +5 armor. | A/B/A            |
| Rank 8 | **Thousand Cuts**: Every 4th hit deals 50% Blade as true damage. Tanks melt. Also +4% Blade damage. | **Untouchable**: Below 35% health she takes 50% less damage for 3s (45s). Also +4 armor.                                | A/B/A            |

| Path    | Buy order (bold = Relic)                                                                                      | Final kit                       |
| ------- | ------------------------------------------------------------------------------------------------------------- | ------------------------------- |
| Offense | Wanderer's Boots → Duelist's Form → Cogged Edge → **Vorpal Blade** → Bloodletter Hook → **Soot Reaver**       | 4 items: 3 Mind, 1 Body         |
| Defense | Wanderer's Boots → Duelist's Form → Boiler Heart → **Vorpal Blade** → Ward-Bell Cuirass → **Undying Larder**  | 4 items: 1 Mind, 3 Body         |
| Utility | Wanderer's Boots → Windstep Geta → Duelist's Form → Séance Prism → **Vorpal Blade** → **Hundred-Hand Ledger** | 4 items: 2 Mind, 1 Body, 1 Soul |

### Queen · Huntress

A sniper with the longest reach on the board. Picks off pieces from far away and moves on to the next one after every kill. The longest auto-attack range in the game (135) and a 280-range signature shot. She never wants to be in melee; kills reset her.

- **Signature: Long Shot** (16s, one enemy, range 280). Shoots an enemy piece up to 280 away for 60 + 110% Blade damage and slows it 30% for 2s.
- **Stat tilt:** +55 attack range, +6% Blade damage, −0.05 attack speed, −8% max health, −2 move speed.
- **Passives:** **Quarry**: every 4th hit on a piece adds 10 + 30% Blade true damage. **Next Target**: each piece she kills cuts her cooldowns by 5s and grants +25 move speed for 4s.

| Rank | Bonus        | Effect                          |
| ---- | ------------ | ------------------------------- |
| 2    | Keen Eye     | +10 attack range.               |
| 3    | Barbed Arrow | Long Shot hits 20% harder.      |
| 5    | Quick Draw   | +0.1 attack speed.              |
| 6    | Patience     | Long Shot recharges 15% faster. |
| 7    | Apex         | +12% Blade damage.              |

| Fork   | Option A                                                                                       | Option B                                                                                                                                | AI picks (O/D/U) |
| ------ | ---------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------- | ---------------- |
| Rank 4 | **Eagle Eye**: Long Shot reaches 25% farther and her attacks +20 range. Also +6% Blade damage. | **Light Feet**: Withdraw recharges 25% faster: she kites instead of out-ranging. Also +4% max health.                                   | A/B/B            |
| Rank 8 | **Kill Shot**: Hits on a piece below 12% health execute it. Also +4% Blade damage.             | **Split Shot**: Every 3rd attack also hits every enemy within 160 of her for 40% Blade. Wave clear and team fights. Also +3 move speed. | A/B/B            |

| Path    | Buy order (bold = Relic)                                                                                          | Final kit                       |
| ------- | ----------------------------------------------------------------------------------------------------------------- | ------------------------------- |
| Offense | Wanderer's Boots → Cogged Edge → Duelist's Form → **Soot Reaver** → Windstep Geta → **Vorpal Blade**              | 4 items: 3 Mind, 1 Body         |
| Defense | Wanderer's Boots → Cogged Edge → Mender's Ledger → **Soot Reaver** → Ward-Bell Cuirass → **Pocket Vault Shell**   | 4 items: 1 Mind, 3 Body         |
| Utility | Wanderer's Boots → Windstep Geta → Bloodletter Hook → Shuttered Door → **Hundred-Hand Ledger** → **Eternal Wick** | 4 items: 1 Mind, 1 Body, 2 Soul |

## Rook: Tower

A walking castle tower. Hard to move, hard to kill, and the piece that knocks the enemy's walls down.

- **Job:** Tank and siege. Holds a lane, soaks damage, breaks Bastions and the Throne.
- **Move flavor:** Straight-line charges: File Charge (120) and, for the Vanguard, Breakthrough (190). Pairs with the King through the Castle gambit.
- **AI:** defender, steadfast. Melee by default.

| Health | Regen | Armor | Resist | Blade | Attack speed | Soul | Move | Range |
| ------ | ----- | ----- | ------ | ----- | ------------ | ---- | ---- | ----- |
| 1700   | 3.5   | 40    | 26     | 68    | 0.8          | 0    | 45   | 26    |

**Why these numbers:** Most health (1700) and armor (40) on the board, solid Blade (68) at a slow 0.8 attack speed. No Soul, so Body and Mind items are his whole economy. The Masonry passive adds 40% Blade on every 3rd hit against non-pieces, which is what makes him the structure breaker even before his style.

**Base abilities** (every style has these):

| #   | Ability      | Cooldown | Aim            | Reach      | What it does                                                                                               |
| --- | ------------ | -------- | -------------- | ---------- | ---------------------------------------------------------------------------------------------------------- |
| 1   | File Charge  | 11s      | one enemy      | range 150  | Charges 120 in a straight line at an enemy, hitting for 30 + 60% Blade damage and slowing it 40% for 1.5s. |
| 2   | Stone Skin   | 15s      | self           | radius 120 | With an enemy piece within 120, turns to stone: a 100 + 80% Blade shield for 4s.                           |
| 3   | Rampart Slam | 12s      | enemies around | radius 95  | Slams the ground: every enemy within 95 takes 40 + 50% Blade damage. Needs 2 enemies.                      |

**Piece passives:** **Masonry**: every 3rd hit on a pawnling, camp or structure deals 40% Blade bonus damage.

### Rook · Bastion

A wall. Enemies near him hit softer and move slower, anyone who strikes him gets stuck, and his lane does not fall. Sits in his lane and makes it unpushable: enemy pieces near him hit 20% softer and stay slowed. The best partner for a carry who needs time.

- **Signature: Hold the Line** (20s, enemies around, radius 150). With an enemy piece within 150, every enemy there takes 25 + 40% Blade damage, deals 20% less Blade damage for 4s and is slowed 40% for 2.5s.
- **Stat tilt:** +12% max health, +10 armor, +8 resist, −15% Blade damage, −2 move speed.
- **Passives:** **Unbreachable**: allied pieces and pawns within 150 gain +10 resist. **Gatehouse**: a piece that hits him is slowed 15% for 1.5s (2s).

| Rank | Bonus       | Effect                                |
| ---- | ----------- | ------------------------------------- |
| 2    | Thick Walls | +6 armor.                             |
| 3    | Mortar      | Stone Skin shields 30% more.          |
| 5    | Long Wall   | Hold the Line covers 20% more ground. |
| 6    | Keep        | +8% max health.                       |
| 7    | Watchtower  | Hold the Line recharges 15% faster.   |

| Fork   | Option A                                                                                                                                  | Option B                                                                                                               | AI picks (O/D/U) |
| ------ | ----------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------- | ---------------- |
| Rank 4 | **Curtain Wall**: When a piece hits him, allies within 160 gain a 60 + 40% Blade shield for 3s (12s). He protects others. Also +5 resist. | **Spiked Walls**: Anything that hits him takes 20 + 25% Blade damage (1s). He punishes instead. Also +4% Blade damage. | B/A/A            |
| Rank 8 | **Immovable**: Below 40% health he takes 50% less damage for 4s (60s). Also +8% max health, +6 armor.                                     | **Great Keep**: Hold the Line covers 25% more ground.                                                                  | B/A/B            |

| Path    | Buy order (bold = Relic)                                                                                                           | Final kit               |
| ------- | ---------------------------------------------------------------------------------------------------------------------------------- | ----------------------- |
| Offense | Wanderer's Boots → Cogged Edge → Boiler Heart → **Soot Reaver** → Bloodletter Hook → **Furnace Bastion**                           | 4 items: 2 Mind, 2 Body |
| Defense | Wanderer's Boots → Boiler Heart → Ward-Bell Cuirass → **Furnace Bastion** → Mender's Ledger → **Pocket Vault Shell**               | 4 items: 4 Body         |
| Utility | Wanderer's Boots → Ward-Bell Cuirass → Shuttered Door → **Pocket Vault Shell** → Pocket Reliquary → **Furnished Pocket Dimension** | 4 items: 2 Body, 2 Soul |

### Rook · Battering Ram

Built to knock down Bastions and the Throne. Strips the armor of everything around him, structures included, and splinters waves. Barely fights pieces; he walks to Bastions. Sapper drops the armor of everything near him by 15 (structures have 35), which with Masonry and Splinter nearly doubles his structure damage compared with another Rook.

- **Signature: Ram** (18s, self, radius 130). With any enemy within 130, lowers his head: +40% attack speed and +15% Blade damage for 6s.
- **Stat tilt:** +15% Blade damage, +0.1 attack speed, −5% max health, −4 armor.
- **Passives:** **Sapper**: enemies within 140, Bastions and the Throne included, lose 15 armor. **Splinter**: hits on pawnlings, camps and structures deal 10 + 15% Blade bonus damage.

| Rank | Bonus            | Effect                            |
| ---- | ---------------- | --------------------------------- |
| 2    | Iron Head        | +6 Blade damage.                  |
| 3    | Momentum         | File Charge recharges 20% faster. |
| 5    | Relentless       | Ram recharges 15% faster.         |
| 6    | Reinforced Frame | +8% max health.                   |
| 7    | Breaker          | +0.1 attack speed.                |

| Fork   | Option A                                                                                                                      | Option B                                                                                                                              | AI picks (O/D/U) |
| ------ | ----------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------- | ---------------- |
| Rank 4 | **Demolisher**: Every 4th hit on a non-piece deals 80% Blade bonus damage. Bastions fall faster. Also +0.04 attack speed.     | **Pusher's Grit**: Every pawnling or camp he kills heals him 2% max health. He can stay in a lane alone. Also +1 health regeneration. | A/B/A            |
| Rank 8 | **Breach**: Enemies within 140, structures included, also lose 15 resist: the whole team sieges with him. Also +2 move speed. | **Lone Siege**: After 3s out of combat he regenerates 2% max health per second. Split push forever. Also +4% max health.              | A/B/A            |

| Path    | Buy order (bold = Relic)                                                                                       | Final kit                       |
| ------- | -------------------------------------------------------------------------------------------------------------- | ------------------------------- |
| Offense | Wanderer's Boots → Cogged Edge → Bloodletter Hook → **Soot Reaver** → Duelist's Form → **Hundred-Hand Ledger** | 4 items: 3 Mind, 1 Body         |
| Defense | Wanderer's Boots → Cogged Edge → Boiler Heart → **Soot Reaver** → Mender's Ledger → **Furnace Bastion**        | 4 items: 1 Mind, 3 Body         |
| Utility | Wanderer's Boots → Cogged Edge → Shuttered Door → **Soot Reaver** → Windstep Geta → **Hundred-Hand Ledger**    | 4 items: 2 Mind, 1 Body, 1 Soul |

### Rook · Vanguard

Starts the fight. Crashes into an enemy piece from far away, staggers it, and the team that follows him hits harder. The team's starter: he picks the fight from 240 away, staggers the target for a second and buffs the allies who follow him in.

- **Signature: Breakthrough** (24s, one enemy, range 240). Charges 190 at an enemy piece up to 240 away, hits for 50 + 70% Blade damage and staggers it (nearly stopped, barely attacking) for 1s.
- **Stat tilt:** +6 move speed, +4 armor, +4 resist, +1 health regeneration.
- **Passives:** **Follow Me**: his hit on a piece gives allies within 170 +10% Blade damage for 4s (10s). **Momentum**: after 3s out of combat, +15 move speed.

| Rank | Bonus            | Effect                               |
| ---- | ---------------- | ------------------------------------ |
| 2    | Spurred          | +4 move speed.                       |
| 3    | Heavy Impact     | Breakthrough hits 25% harder.        |
| 5    | Shock Troops     | Rampart Slam covers 25% more ground. |
| 6    | Vanguard's Plate | +8 armor and +4 resist.              |
| 7    | First In         | Breakthrough recharges 15% faster.   |

| Fork   | Option A                                                                                                                              | Option B                                                                                                                                               | AI picks (O/D/U) |
| ------ | ------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------ | ---------------- |
| Rank 4 | **Lance Line**: Breakthrough reaches 30% farther. He picks fights from further away.                                                  | **Hold Fast**: His hits on a piece give him a 60 + 50% Blade shield for 2s (8s). He survives what he starts. Also +6 armor, +100 max health.           | A/B/A            |
| Rank 8 | **Shockwave**: Every 5th hit on a piece shakes every enemy within 110: 40% Blade damage and 30% slow for 1.5s. Also +4% Blade damage. | **Spearhead**: Each enemy piece he kills gives allies within 200 +15% attack speed for 4s and heals them 5% max health. Also +1.5 health regeneration. | A/B/B            |

| Path    | Buy order (bold = Relic)                                                                                                        | Final kit                       |
| ------- | ------------------------------------------------------------------------------------------------------------------------------- | ------------------------------- |
| Offense | Wanderer's Boots → Duelist's Form → Boiler Heart → **Vorpal Blade** → Cogged Edge → **Soot Reaver**                             | 4 items: 2 Mind, 2 Body         |
| Defense | Wanderer's Boots → Ward-Bell Cuirass → Boiler Heart → **Pocket Vault Shell** → Mender's Ledger → **Furnace Bastion**            | 4 items: 4 Body                 |
| Utility | Wanderer's Boots → Windstep Geta → Ward-Bell Cuirass → Shuttered Door → **Pocket Vault Shell** → **Furnished Pocket Dimension** | 5 items: 1 Mind, 2 Body, 2 Soul |

## Bishop: Diagonal

A mitred priest who works along the long diagonals: thin beams that reach far, and blessings for the wounded.

- **Job:** Soul caster and healer. Long range, narrow area.
- **Move flavor:** Long diagonal beams: Diagonal Beam hits one target 175 away; Censure blasts only 50 around its target, at 170. No dashes.
- **AI:** farmer, cautious. Ranged by default.

| Health | Regen | Armor | Resist | Blade | Attack speed | Soul | Move | Range |
| ------ | ----- | ----- | ------ | ----- | ------------ | ---- | ---- | ----- |
| 880    | 2.5   | 18    | 30     | 34    | 0.85         | 54   | 45   | 110   |

**Why these numbers:** Highest base Soul (54) and resist (30) with low health (880): she must stay behind. Range 110 and 30% Soul on auto attacks make her a real lane threat. The Mitre shield is her one safety net.

**Base abilities** (every style has these):

| #   | Ability       | Cooldown | Aim            | Reach                | What it does                                                                                                                     |
| --- | ------------- | -------- | -------------- | -------------------- | -------------------------------------------------------------------------------------------------------------------------------- |
| 1   | Diagonal Beam | 6s       | one enemy      | range 175            | A long beam at one enemy up to 175 away: 40 + 65% Soul damage.                                                                   |
| 2   | Blessing      | 12s      | most hurt ally | range 180            | Heals the most wounded piece within 180 (when below 75% health) for 50 + 55% Soul.                                               |
| 3   | Censure       | 14s      | blast at range | range 170, radius 50 | A narrow blast on an enemy piece up to 170 away: everything within 50 of it takes 30 + 35% Soul damage and is slowed 40% for 2s. |

**Piece passives:** **Mitre**: dropping below 40% health raises a 60 + 60% Soul shield for 3s (30s).

### Bishop · Light

The healer. Keeps the court standing with big group heals, a regeneration halo and small heals that never stop. Radiance, Blessing and Grace overlap so a fight near her lasts longer; the Halo also heals pawns, so her lane wins long trades.

- **Signature: Radiance** (24s, allies around, radius 200). When a piece within 200 is below 60% health, heals every piece there for 70 + 70% Soul and shields them for 30 + 30% Soul for 3s.
- **Stat tilt:** +10 Soul power, +8% cooldown reduction, +4 resist, −10% Blade damage.
- **Passives:** **Halo**: allied pieces and pawns within 160 regenerate +4 health per second. **Grace**: every 6s, allied pieces within 150 heal 10 + 12% Soul.

| Rank | Bonus       | Effect                              |
| ---- | ----------- | ----------------------------------- |
| 2    | Devotion    | Blessing heals 20% more.            |
| 3    | Choir       | Radiance covers 15% more ground.    |
| 5    | Litany      | Blessing recharges 20% faster.      |
| 6    | Benediction | Radiance heals 20% more.            |
| 7    | Saint       | +10% Soul power and +5% max health. |

| Fork   | Option A                                                                           | Option B                                                                                                                                                        | AI picks (O/D/U) |
| ------ | ---------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------- |
| Rank 4 | **Long Blessing**: Blessing reaches 30% farther. Heal across the lane from safety. | **Penitent Ward**: When a piece hits her, allies within 160 gain a 40 + 40% Soul shield for 3s (12s). Prevent instead of cure. Also +10 resist, +6% max health. | A/B/A            |
| Rank 8 | **Miracle**: Radiance recharges 15% faster.                                        | **Wrath of Heaven**: Every 5s the nearest enemy piece within 250 takes 25 + 40% Soul damage. Some of the light burns. Also +15% Soul power.                     | B/A/A            |

| Path    | Buy order (bold = Relic)                                                                                                            | Final kit               |
| ------- | ----------------------------------------------------------------------------------------------------------------------------------- | ----------------------- |
| Offense | Wanderer's Boots → Séance Prism → Pocket Reliquary → **Eternal Wick** → Wishgranter's Receipt → **Locked Cabinet of Wishes**        | 4 items: 1 Body, 3 Soul |
| Defense | Wanderer's Boots → Pocket Reliquary → Mender's Ledger → **Furnished Pocket Dimension** → Ward-Bell Cuirass → **Pocket Vault Shell** | 4 items: 3 Body, 1 Soul |
| Utility | Wanderer's Boots → Shuttered Door → Pocket Reliquary → **Furnished Pocket Dimension** → Séance Prism → **Eternal Wick**             | 4 items: 1 Body, 3 Soul |

### Bishop · Shadow

Damage over time from the far diagonal. Everything she touches keeps burning; kills bring her curses back sooner. Pure damage over time from 220 away. Her burns keep ticking after she retreats, so she trades well without committing.

- **Signature: Black Diagonal** (15s, blast at range, range 220, radius 60). Curses a spot up to 220 away: enemies within 60 burn for 18 + 30% Soul damage per second for 5s and lose 10 resist.
- **Stat tilt:** +20 Soul power, +20 attack range, −5% max health, +4% cooldown reduction.
- **Passives:** **Creeping Night**: her attacks on a piece leave a 6 + 12% Soul per second burn for 4s. **Nightfall**: each enemy piece she kills cuts her cooldowns by 4s.

| Rank | Bonus       | Effect                                 |
| ---- | ----------- | -------------------------------------- |
| 2    | Deeper Dark | Black Diagonal burns 20% harder.       |
| 3    | Long Shadow | +10 attack range.                      |
| 5    | Eclipse     | Diagonal Beam hits 25% harder.         |
| 6    | Night Tide  | Black Diagonal covers 25% more ground. |
| 7    | Void        | +12% Soul power.                       |

| Fork   | Option A                                                                  | Option B                                                                                                                       | AI picks (O/D/U) |
| ------ | ------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------ | ---------------- |
| Rank 4 | **Plague**: Black Diagonal covers 25% more ground. Curse the whole fight. | **Wither**: Her attacks on a piece cut its Blade damage by 15% for 3s (4s). Cripple the carry. Also +6% max health, +8 resist. | A/B/A            |
| Rank 8 | **Unending Night**: Black Diagonal recharges 15% faster.                  | **Soul Harvest**: Every kill heals her 3% max health and grants +3 Soul power for 60s (up to 10 times). Also +15% Soul power.  | B/A/A            |

| Path    | Buy order (bold = Relic)                                                                                                     | Final kit                       |
| ------- | ---------------------------------------------------------------------------------------------------------------------------- | ------------------------------- |
| Offense | Wanderer's Boots → Wishgranter's Receipt → Séance Prism → **Eternal Wick** → Pocket Reliquary → **Locked Cabinet of Wishes** | 4 items: 1 Body, 3 Soul         |
| Defense | Wanderer's Boots → Séance Prism → Ward-Bell Cuirass → **Eternal Wick** → Mender's Ledger → **Pocket Vault Shell**            | 4 items: 3 Body, 1 Soul         |
| Utility | Wanderer's Boots → Shuttered Door → Séance Prism → **Eternal Wick** → Windstep Geta → **Locked Cabinet of Wishes**           | 4 items: 1 Mind, 1 Body, 2 Soul |

### Bishop · Zealot

A battle priest who wades into melee. Every blow she lands heals the pieces around her. Changes the Bishop into a melee fighter (−76 range, +300 health, +14 armor). She heals by hitting: Penance heals every ally near her once a second while she attacks.

- **Signature: Crusade** (22s, self, radius 130). With an enemy piece within 130, she attacks 35% faster and takes 15% less damage for 6s.
- **Stat tilt:** −76 attack range, +300 max health, +14 armor, +4 resist, +22 Blade damage, −20% Soul power, +3 move speed.
- **Passives:** **Penance**: each hit (at most once a second) heals allied pieces within 150, her included, for 5 + 5% Blade + 8% Soul. **Fervor**: dropping below 35% health heals her 15% max health (60s).

| Rank | Bonus           | Effect                         |
| ---- | --------------- | ------------------------------ |
| 2    | Mace            | +6 Blade damage.               |
| 3    | Litany of Wrath | Crusade recharges 15% faster.  |
| 5    | Holy Fire       | Diagonal Beam hits 30% harder. |
| 6    | Iron Faith      | +8 armor.                      |
| 7    | Inquisitor      | +0.1 attack speed.             |

| Fork   | Option A                                                                                                        | Option B                                                                                       | AI picks (O/D/U) |
| ------ | --------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------- | ---------------- |
| Rank 4 | **Sermon**: Every 6s, allied pieces within 150 heal 15 + 20% Soul. More priest. Also +5% max health.            | **Smite**: Every 3rd hit deals 15 + 35% Soul bonus damage. More battle. Also +5% Blade damage. | B/A/B            |
| Rank 8 | **Crusader's Vow**: Each enemy piece she kills heals allies within 200 for 10% max health. Also +6% Soul power. | **Unbowed**: Below 30% health she takes 50% less damage for 3s (50s). Also +6 armor.           | A/B/A            |

| Path    | Buy order (bold = Relic)                                                                                                    | Final kit                       |
| ------- | --------------------------------------------------------------------------------------------------------------------------- | ------------------------------- |
| Offense | Wanderer's Boots → Cogged Edge → Séance Prism → **Soot Reaver** → Bloodletter Hook → **Eternal Wick**                       | 4 items: 2 Mind, 1 Body, 1 Soul |
| Defense | Wanderer's Boots → Boiler Heart → Pocket Reliquary → **Furnace Bastion** → Mender's Ledger → **Furnished Pocket Dimension** | 4 items: 3 Body, 1 Soul         |
| Utility | Wanderer's Boots → Pocket Reliquary → Cogged Edge → **Furnished Pocket Dimension** → Shuttered Door → **Soot Reaver**       | 4 items: 1 Mind, 1 Body, 2 Soul |

## Knight: Leaper

A horse-headed rider who appears where nobody is looking: over the jungle walls, onto the backline, into an empty lane.

- **Job:** Assassin and roamer; the jungler. Burst, mobility, fast camp clear.
- **Move flavor:** L-shaped leaps: L-Leap (130) in, Spur Away (120) out, Lance Through and Gallant Leap (200). (The engine stops dashes at cliffs; the leap-over-terrain fantasy is visual only for now.)
- **AI:** farmer, opportunist. Melee by default.

| Health | Regen | Armor | Resist | Blade | Attack speed | Soul | Move | Range |
| ------ | ----- | ----- | ------ | ----- | ------------ | ---- | ---- | ----- |
| 1020   | 2.5   | 26    | 20     | 66    | 1            | 0    | 54   | 24    |

**Why these numbers:** Fastest piece (54) with the fastest base attack speed (1.0) and good Blade (66), mid health. The Outrider passive adds 6 + 15% Blade to every hit on camps, pawnlings and structures, so he clears jungle quickly and threatens unguarded Bastions.

**Base abilities** (every style has these):

| #   | Ability   | Cooldown | Aim            | Reach     | What it does                                                                         |
| --- | --------- | -------- | -------------- | --------- | ------------------------------------------------------------------------------------ |
| 1   | L-Leap    | 9s       | one enemy      | range 160 | Leaps 130 onto an enemy and strikes for 35 + 80% Blade damage.                       |
| 2   | Trample   | 10s      | enemies around | radius 85 | Rears and tramples every enemy within 85 for 30 + 60% Blade damage. Needs 2 enemies. |
| 3   | Spur Away | 15s      | one enemy      | range 80  | Below 45% health, spurs 120 away from a close enemy and slows it 40% for 2s.         |

**Piece passives:** **Outrider**: hits on pawnlings, camps and structures deal 6 + 15% Blade bonus damage.

### Knight · Lancer

The assassin. A huge lance charge onto the most exposed piece; every kill readies the next charge. Waits for a target, then crosses 200 in one charge. Each kill takes 10s off every cooldown, so a good dive chains into the next piece.

- **Signature: Lance Through** (18s, one enemy, range 230). Charges 200 at an enemy piece up to 230 away and runs it through for 70 + 120% Blade damage.
- **Stat tilt:** +12% Blade damage, +0.05 attack speed, −8% max health, −4 armor.
- **Passives:** **Coup de Grâce**: each enemy piece he kills cuts his cooldowns by 10s and heals him 10% max health. **Couched Lance**: his first hit on a piece every 8s adds 20 + 25% Blade true damage.

| Rank | Bonus         | Effect                              |
| ---- | ------------- | ----------------------------------- |
| 2    | Sharp Lance   | Lance Through hits 15% harder.      |
| 3    | Swift Steed   | +4 move speed.                      |
| 5    | Long Leap     | L-Leap reaches 25% farther.         |
| 6    | Champion      | +8% Blade damage.                   |
| 7    | Repeat Charge | Lance Through recharges 15% faster. |

| Fork   | Option A                                                                             | Option B                                                                                                              | AI picks (O/D/U) |
| ------ | ------------------------------------------------------------------------------------ | --------------------------------------------------------------------------------------------------------------------- | ---------------- |
| Rank 4 | **Deep Strike**: Lance Through reaches 30% farther: past the front line to the back. | **Jousting Plate**: +12 armor and +10% max health: survive the landing.                                               | A/B/A            |
| Rank 8 | **Skewer**: Lance Through hits 20% harder.                                           | **Breakaway**: When a piece hits him below 40% health he leaps 120 away from it (16s). Also +8% max health, +8 armor. | A/B/A            |

| Path    | Buy order (bold = Relic)                                                                                            | Final kit                       |
| ------- | ------------------------------------------------------------------------------------------------------------------- | ------------------------------- |
| Offense | Wanderer's Boots → Duelist's Form → Bloodletter Hook → **Vorpal Blade** → Cogged Edge → **Hundred-Hand Ledger**     | 4 items: 3 Mind, 1 Body         |
| Defense | Wanderer's Boots → Duelist's Form → Ward-Bell Cuirass → **Vorpal Blade** → Mender's Ledger → **Pocket Vault Shell** | 4 items: 1 Mind, 3 Body         |
| Utility | Wanderer's Boots → Windstep Geta → Séance Prism → **Vorpal Blade** → Shuttered Door → **Eternal Wick**              | 5 items: 2 Mind, 1 Body, 2 Soul |

### Knight · Errant

A wandering knight. Clears the jungle fastest, moves fastest out of combat and knocks down undefended Bastions while the enemy looks elsewhere. Lives in the jungle and empty lanes. The fastest piece out of combat (+20), strongest camp and structure damage, and Questing Blow is cast on camps and waves constantly.

- **Signature: Questing Blow** (11s, enemies around, radius 110). Sweeps every enemy within 110 for 45 + 80% Blade damage. Used on camps and waves as often as on pieces.
- **Stat tilt:** +6 move speed, +2 health regeneration, +5% Blade damage, +5% max health.
- **Passives:** **Forager**: hits on pawnlings, camps and structures deal a further 25% Blade bonus damage. **Wanderlust**: after 3s out of combat, +20 move speed.

| Rank | Bonus               | Effect                                                   |
| ---- | ------------------- | -------------------------------------------------------- |
| 2    | Trail Rations       | Every pawnling or camp he kills heals him 2% max health. |
| 3    | Wide Sweep          | Questing Blow covers 15% more ground.                    |
| 5    | Long Road           | +5 move speed.                                           |
| 6    | Questing Blade      | Questing Blow hits 20% harder.                           |
| 7    | Knight of the Wilds | +8% max health and +5% Blade damage.                     |

| Fork   | Option A                                                                                               | Option B                                                                                                                                                | AI picks (O/D/U) |
| ------ | ------------------------------------------------------------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------- |
| Rank 4 | **Raider**: Every 4th hit on a non-piece deals 60% Blade bonus damage. Split push. Also +3 move speed. | **Ambusher**: His first hit on a piece every 10s deals 30 + 60% Blade bonus damage and slows 30% for 1.5s. Gank from the jungle. Also +5% Blade damage. | B/A/A            |
| Rank 8 | **Siegebreaker**: Enemies within 120, structures included, lose 10 armor. Also +2 move speed.          | **Hunter of Pieces**: Each enemy piece he kills cuts his cooldowns by 6s and heals 10% max health. Also +4% max health.                                 | A/B/A            |

| Path    | Buy order (bold = Relic)                                                                                    | Final kit                       |
| ------- | ----------------------------------------------------------------------------------------------------------- | ------------------------------- |
| Offense | Wanderer's Boots → Cogged Edge → Bloodletter Hook → **Soot Reaver** → Duelist's Form → **Vorpal Blade**     | 4 items: 3 Mind, 1 Body         |
| Defense | Wanderer's Boots → Bloodletter Hook → Boiler Heart → **Furnace Bastion** → Cogged Edge → **Undying Larder** | 4 items: 2 Mind, 2 Body         |
| Utility | Wanderer's Boots → Windstep Geta → Cogged Edge → **Soot Reaver** → Shuttered Door → **Eternal Wick**        | 5 items: 2 Mind, 1 Body, 2 Soul |

### Knight · Paladin

A protector. Leaps to the most wounded ally and shields it, and weakens whoever he hits. Plays the Knight backwards: he leaps to an ally, not an enemy. Gallant Leap shields the most wounded piece, Rebuke weakens whoever he hits, and the Oath field reduces damage on the pieces near him.

- **Signature: Gallant Leap** (18s, most hurt ally, range 260). When an allied piece within 260 drops below 55% health, leaps 200 to the most wounded one and shields it for 110 + 80% Blade for 3s.
- **Stat tilt:** +15% max health, +8 armor, +8 resist, −10% Blade damage, −2 move speed.
- **Passives:** **Rebuke**: his hit on a piece cuts its Blade damage by 20% for 3s (6s). **Oath**: allied pieces and pawns within 130 take 5% less damage.

| Rank | Bonus            | Effect                                                     |
| ---- | ---------------- | ---------------------------------------------------------- |
| 2    | Steadfast        | +6 armor.                                                  |
| 3    | Swift Rescue     | Gallant Leap recharges 10% faster and reaches 10% farther. |
| 5    | Holy Shield      | Gallant Leap shields 25% more.                             |
| 6    | Warhorse         | +4 move speed.                                             |
| 7    | Bulwark of Faith | +8% max health.                                            |

| Fork   | Option A                                                                                 | Option B                                                                                                                                               | AI picks (O/D/U) |
| ------ | ---------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------ | ---------------- |
| Rank 4 | **Far Rescue**: Gallant Leap reaches 30% farther: he covers more of the map.             | **Lay on Hands**: Every 6s, allied pieces within 140 heal 15 + 20% Blade. Steady sustain where he stands. Also +8% max health, +2 health regeneration. | A/B/A            |
| Rank 8 | **Intercept**: A piece that hits him is staggered for 1s (8s). Also +8 armor, +8 resist. | **Aegis Knight**: Gallant Leap shields 20% more.                                                                                                       | B/A/B            |

| Path    | Buy order (bold = Relic)                                                                                                           | Final kit               |
| ------- | ---------------------------------------------------------------------------------------------------------------------------------- | ----------------------- |
| Offense | Wanderer's Boots → Cogged Edge → Ward-Bell Cuirass → **Soot Reaver** → Duelist's Form → **Vorpal Blade**                           | 4 items: 2 Mind, 2 Body |
| Defense | Wanderer's Boots → Ward-Bell Cuirass → Mender's Ledger → **Pocket Vault Shell** → Boiler Heart → **Furnace Bastion**               | 4 items: 4 Body         |
| Utility | Wanderer's Boots → Ward-Bell Cuirass → Pocket Reliquary → **Furnished Pocket Dimension** → Shuttered Door → **Pocket Vault Shell** | 4 items: 2 Body, 2 Soul |

## Build paths: the rules used

- **Offense** leans Mind (Soul for Sovereign, Regent, Light and Shadow), **Defense** leans Body, **Utility** leans Soul and cooldowns, with Mind kept where a style needs its weapon (Warlord, Ram, Errant).
- Every list is six steps, ends on a Relic and holds one or two Relics. Wanderer's Boots come first everywhere because rotations matter more without a player hero.
- Lists are **per style** (the tables above). The current schema stores one set per piece, so the piece-level `paths` in each JSON file hold the default style's lists (King: Warlord, Queen: Huntress, Rook: Bastion, Bishop: Light, Knight: Lancer), and each style carries its own `paths` block for when the sim reads it.

## Gambits

| Card           | Piece  | Target | Tempo | ≈ pawns | Lasts   | Numbers (`params`)                      | Effect                                                                         |
| -------------- | ------ | ------ | ----- | ------- | ------- | --------------------------------------- | ------------------------------------------------------------------------------ |
| Advance        | —      | lane   | 15    | 1.0     | 20 s    | moveSpeedMul 1.1                        | Pieces, pawns and pawnlings in that lane push; +10% move speed for 20 s.       |
| Hold the File  | —      | lane   | 20    | 1.3     | 20 s    | armorMul 1.15, resistMul 1.15           | Pieces in that lane defend; +15% armor and resist for 20 s.                    |
| Regroup        | —      | point  | 25    | 1.7     | 15 s    | radius 180                              | Every living piece gathers at the point for 15 s.                              |
| Pawn Storm     | —      | lane   | 30    | 2.0     | 15 s    | damageMul 1.5, moveSpeedMul 1.5         | That lane's pawns and pawnlings deal +50% damage and move 50% faster for 15 s. |
| Check          | —      | enemy  | 30    | 2.0     | 8 s     | damageTakenMul 1.2                      | Marks an enemy piece: it takes 20% more damage for 8 s, visible to all.        |
| Castle         | King   | none   | 20    | 1.3     | instant | —                                       | King and Rook swap places instantly.                                           |
| Queen's Gambit | Queen  | none   | 40    | 2.7     | 12 s    | damageMul 1.4, afterMul 0.8, afterSec 6 | Queen deals +40% damage for 12 s, then -20% for 6 s.                           |
| Siege          | Rook   | enemy  | 35    | 2.3     | 10 s    | structureMul 1.3                        | Rook and its lane focus a Bastion or Throne; +30% structure damage for 10 s.   |
| Sanctuary      | Bishop | point  | 35    | 2.3     | 6 s     | healPctPerSec 0.04, radius 150          | A zone that heals allies 4% max health per second for 6 s.                     |
| Fork           | Knight | enemy  | 45    | 3.0     | 1 s     | reach 500, stunSec 1                    | Knight leaps to an enemy piece within reach and stuns it for 1 s.              |

**How the costs were set.** A pawn costs 15 Tempo, so every card is priced in pawns:

- **About 1 pawn** (Advance, 15): a nudge you can play often.
- **1–2 pawns** (Hold the File, Castle, Regroup): situational. Castle is cheap because it needs both King and Rook alive and in useful places.
- **2 pawns** (Pawn Storm, Check): Pawn Storm is only worth it with pawns in the lane, so it pays off for pawn-heavy teams. Check is the universal kill setup.
- **2.3–3 pawns** (Siege, Sanctuary, Queen's Gambit, Fork): the signature cards, each worth a Bastion or a kill when timed well. Fork is the most expensive because a 1 s stun on a carry usually decides a fight.
- Signature cards have weight 1.5 against 2–3 for universal cards, so a hand usually holds one signature card.

**Tempo budget.** At +1 per second plus kills and Bastions, a team earns roughly 1,000–1,100 Tempo in a 15-minute match, capped at 100 at any moment. That is about 70 pawns or 30 cards; real teams mix both. Holding Tempo past 100 wastes it, so a doctrine is really a spending rule:

- **Pawn-heavy** (about 70% on pawns): keep the pawn cap full in one or two lanes and spend the rest on Pawn Storm and Hold the File. Steady pressure, wins on structures, weak to a single big fight.
- **Gambit-heavy** (pawns only to replace losses): bank 60–90 Tempo and spend it in bursts, such as Check + Fork (75) on one carry, or Queen's Gambit + Regroup (65) for a team fight. Wins fights, but lanes thin out if the burst misses.
- **Balanced:** field pawns while waiting for the signature card you want, then play it.

## How builds diverge: four doctrines

Same five pieces on both sides; what differs is style, path, lanes and how Tempo is spent.

| Doctrine             | Left (2)                                          | Right (2)                                            | Mid (1)                  | Tempo plan                                                                                   | Wins by                                                                                                                                                                                                                            |
| -------------------- | ------------------------------------------------- | ---------------------------------------------------- | ------------------------ | -------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Iron Court**       | King Warlord (Defense), Rook Bastion (Defense)    | Bishop Light (Utility), Knight Paladin (Defense)     | Queen Huntress (Offense) | Pawn-heavy: fill the cap behind the Warlord, Pawn Storm on Left, Hold the File on Right      | Buffed pawns. Next to the Warlord and Bastion a pawn gets +6 Blade (about +12%), +3 regen and +10 resist; Light's Halo adds +4 regen on the other side. Lanes grind forward and the Huntress picks off whoever comes to stop them. |
| **Queen's Guard**    | Queen Duelist (Offense), King Sovereign (Utility) | Bishop Light (Defense), Knight Paladin (Utility)     | Rook Vanguard (Defense)  | Gambit-heavy: save for Queen's Gambit + Check once the Queen is Rank 5+, Regroup to collapse | One piece carries. The Duelist sits inside the Sovereign's 6% damage field and Aegis shields, the Paladin leaps onto her when she drops, the Vanguard starts fights for her.                                                       |
| **Siege Train**      | Knight Errant (Utility), Bishop Zealot (Offense)  | Rook Battering Ram (Offense), King Warlord (Offense) | Queen Regent (Utility)   | Pawns into the Ram's lane (pawns already deal ×1.4 to structures), then Siege and Advance    | Structures. Sapper strips 15 armor off Bastions, War Drums lifts the pawns, the Regent clears the waves that come to defend, and the Errant takes the undefended lane.                                                             |
| **Assassins' Guild** | Knight Lancer (Offense), Bishop Shadow (Offense)  | King Usurper (Offense), Rook Vanguard (Defense)      | Queen Huntress (Offense) | Gambit-heavy: Check + Fork on the enemy carry, pawns only to hold lanes                      | Picks. Each Lancer or Huntress kill resets cooldowns, Shadow's burns finish runners, the Usurper wins his lane alone. Weak to Bastion and Paladin, which turn the pick into a 2-for-1.                                             |

A natural counter loop: **Assassins** beat **Siege Train** (the Ram and the Errant are alone), **Siege Train** beats **Queen's Guard** (one carry can't defend three lanes), **Queen's Guard** beats **Iron Court** (late Queen beats pawns), and **Iron Court** beats **Assassins** (tanks, damage reduction and shields blunt the burst).

## What the balance run should watch

- **Per-style win rate and pick rate** (target 45–55% each, every style picked at least 15% when the AI chooses freely). Most at risk:
  - **Usurper**: 18% lifesteal plus the 10% Leech Lord fork, on a 1450-health piece. Lower Stolen Tithe first.
  - **Regent**: Mandate takes 0.5 s off every cooldown per kill, pawnlings included. Watch casts per minute; lower to 0.3 s if she runs away.
  - **Battering Ram**: Sapper (−15 armor) stacks with Masonry, Splinter, Siege and pawns' ×1.4. The 9% per second structure cap stops a melt, but watch first-Bastion time in his lane.
  - **Sovereign and Zealot**: each changes range by 70 or more. Check that the AI positions them where their new range works (Sovereign behind, Zealot in front).
- **Pawn auras:** Warlord, Bastion, Light, Sovereign and Paladin all buff pawns. Compare pawn kill counts by style to see whether pawn-heavy play only works with those five.
- **Fork picks:** each fork should be taken by at least one path (see the O/D/U columns). If a fork option never wins in matches, it is too weak, not just unpicked.
- **Queen curve:** her win rate by match length should rise. If she wins short games, her early numbers are too high.
- **Gambit value:** White with auto-gambits against White with none should gain 8–15 points. If Fork or Check alone supplies most of that, raise their cost by 5.
- **Tempo split:** share of Tempo spent on pawns versus cards. If either side passes 85%, the other use is underpriced.

## Engine limits this design works around

- **No stun, taunt or structure-damage effects.** Stagger (move and attack speed cut to the floors) stands in for a stun. Bastion's "taunt" is an area hit that cuts enemy Blade damage by 20% and slows them. Structure damage comes from enemy armor auras (they hit structures) and hit triggers on non-pieces (`vs: other`).
- **Abilities can't target structures.** Only auto attacks, hit triggers and enemy auras touch Bastions and the Throne.
- **Ability power does not scale stat buffs.** A rank or fork perk that multiplies "power" only changes damage, heals, shields and burns. So the perks on pure buff skills (Banner of War, Ram, Crusade) tweak cooldown or radius instead.
- **Dashes stop at cliffs.** The Knight's "leap over terrain" is flavor until the engine allows it.
- **A group skill aimed at allies can't check for nearby enemies.** Such skills wait for a hurt ally instead (for example, Banner of War waits for any piece under 90% health).
