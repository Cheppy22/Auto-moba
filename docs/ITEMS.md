# Item sheet v2 and item color theory (draft for approval)

The goal is to give each of the 36 items its own character. Every item gets **at most two stats and one signature rule**. Tier 3 items become **Relics**, each with a rule that changes how the hero plays.

Item ids, build trees and costs stay the same, so hero build lists and the balance tools keep working. Some names change and every description is rewritten in the color markup defined below.

Status: **draft, not built**. Once approved, Sonnet implements it in this order: schema → content → `RichText` UI → balance.

---

## 1. Color theory

### Principles

1. **Hue = what the item feeds.** Each category owns one hue family. No other part of the game uses those hues: not team colors, not UI state.
   - **Mind** is cobalt steel (hue 214°): a cold, tempered edge, standing for technique and the weapon.
   - **Body** is moss and verdigris (hue 85°): living tissue, wrapped in old metal.
   - **Soul** is lantern violet (hue 264°): the xxxHolic spirit-light.
2. **Brightness = tier.** Tier 1 is muted (raw material) and tier 2 is the pure hue. A tier 3 Relic is the brightest tint, and also gets a **brass rim**. Brass marks rarity and money in every category; it never stands for a category.
3. **Reserved hues never change meaning:**
   - teal and red: your team and the enemy
   - brass: gold, price and rarity
   - seal red: a cost to you (curses, "the price", self-damage)
   - warm white: true damage
   - washi cream: neutral text
4. **In descriptions, color the stat words, never the grammar.**
   - **Number plus keyword:** color the pair together ("**+24 Blade**").
   - **Rule words:** "When hit", "Every 8s", "Once per life" and the like are brass small caps, so the eye reads the condition first and the effect second.
   - **Everything else:** neutral washi text.
   - **Color budget:** at most 2 keyword colors per sentence. A Relic's rule name, such as "Cinder Wake", is in its category's brightest tint.
5. **Color is never the only signal.** Every colored keyword keeps its word ("Blade", "Soul", "health"). Tiles keep their category glyph (eye, heart, flame) and tier diamonds. Every text color has at least 5.7:1 contrast on the panel backgrounds (checked against `--lacquer` #15111e and `--lacquer-2` #1d1828).

### Palette

| Token        | Hex       | Use                                                   | Contrast on #15111e |
| ------------ | --------- | ----------------------------------------------------- | ------------------- |
| `--mind-1`   | `#7d97b8` | Mind tier 1 tile tint                                 | 6.2                 |
| `--mind`     | `#8fb8ec` | Mind keywords, tier 2 tint, tab color                 | 9.1                 |
| `--mind-3`   | `#b8d6ff` | Mind Relic tint and Relic rule name                   | 12.5                |
| `--body-1`   | `#93a77a` | Body tier 1                                           | 7.1                 |
| `--body`     | `#a9c97c` | Body keywords, tier 2                                 | 10.0                |
| `--body-3`   | `#cde6a2` | Body Relic                                            | 13.7                |
| `--soul-1`   | `#a596c0` | Soul tier 1                                           | 6.8                 |
| `--soul`     | `#c3a2f4` | Soul keywords, tier 2                                 | 8.7                 |
| `--soul-3`   | `#ddc8ff` | Soul Relic                                            | 12.2                |
| `--kw-true`  | `#f6f0e2` | True damage (bold)                                    | 16.3                |
| `--kw-gold`  | `#f0d58a` | Gold amounts, Relic rim                               | 12.9                |
| `--kw-price` | `#ec6a70` | Costs to you: negative stats, self-damage, curse text | 6.1                 |
| `--kw-rule`  | `#c9a24a` | Rule words, in small caps                             | 7.7                 |

Hue spacing: Mind 214°, Body 85°, Soul 264°. Team teal sits at 163° and enemy red at 356°. Mind and Soul are only 50° apart, so they are also split by lightness and glyph (eye and flame).

### Which keyword takes which color

| Color     | Keywords                                                                   |
| --------- | -------------------------------------------------------------------------- |
| **Mind**  | Blade damage, attack speed, move speed, bleed, extra hits, cleave, execute |
| **Body**  | health, max health, armor, regen, healing, shields, damage taken           |
| **Soul**  | Soul power, Soul damage, resist, cooldowns and cooldown reduction          |
| **True**  | true damage                                                                |
| **Price** | anything that costs you: "−80 health", "lose 15 health", curse flaws       |
| **Gold**  | gold amounts and prices                                                    |

### Markup that Sonnet will parse

`{m|text}` mind · `{b|text}` body · `{s|text}` soul · `{t|text}` true · `{g|text}` gold · `{p|text}` price · `{r|text}` rule word.

The ids are single letters to keep the JSON readable. A `RichText` component renders these as spans with classes `kw-m`, `kw-b` and so on. A `plainText()` helper strips the markup for tooltips, the AI and tests. Hero ability text can adopt the same markup later.

Example, Cogged Edge:
`{m|+24 Blade}, {m|+0.2 attack speed}. {r|Ratchet}: each hit on the same hero grants {m|+4% attack speed} for 3s, up to 5 times.`

---

## 2. Engine additions needed

These are small and generic. Everything else uses the triggers and effects that already exist.

| Addition                                | What it does                                                                                                                                  | Used by                                         |
| --------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------- |
| Trigger `vs: 'hero' \| 'other'`         | Fire only when the victim or attacker is, or is not, a hero                                                                                   | Cleaver, Drill, Tin Ward, Hook, Ward-Bell       |
| Trigger `dmgType`                       | `damaged` fires only for that damage type                                                                                                     | Spirit Lens                                     |
| Trigger `everyNth`                      | `hit` fires on every Nth hit                                                                                                                  | Gauntlet, Soot Reaver                           |
| Trigger `maxStacks`                     | Cap on simultaneous statMods from this trigger, refreshed on reapply                                                                          | Cogged Edge, Candle Stub                        |
| Custom `outOfCombat` (param = seconds)  | Runs the trigger's effects each second once out of combat that long                                                                           | Iron Lung, Wanderer's Boots                     |
| Custom `execute` (param = hp fraction)  | A hit on a hero below the fraction deals true damage equal to its remaining health                                                            | The Single Cut                                  |
| Custom `lastStand`                      | Once per life, lethal damage leaves 1 health and applies the trigger's effects. Resets on respawn. Generalise `reviveOnce` if that is simpler | Pocket Vault Shell                              |
| Custom `cooldownTick` (param = seconds) | Reduces all the owner's ability cooldowns by `param` seconds                                                                                  | Bottled Hour, Hundred-Hand Ledger, Eternal Wick |

---

## 3. The sheet

"Rule" is the signature. Stats are kept to two (one Relic carries three). The text after "→" is the exact new `desc`.

### Mind: technique and the weapon (cobalt steel)

| Item                    | T   | From               | Stats                             | Rule                                                                                  | Identity                 |
| ----------------------- | --- | ------------------ | --------------------------------- | ------------------------------------------------------------------------------------- | ------------------------ |
| Rusted Cleaver          | 1   | —                  | +10 Blade                         | **Chop**: hits on minions and camps deal +20% Blade                                   | The farming knife        |
| Piston Gauntlet         | 1   | —                  | +0.15 attack speed                | **Wind-up**: every 4th hit strikes twice                                              | Rhythm                   |
| Leech Fang              | 1   | —                  | +6 Blade                          | **Feed**: heal 10% of Blade damage dealt                                              | Sustain in lane          |
| Whetstone Drill         | 1   | —                  | +8 Blade                          | **Honed**: hits on heroes deal 8 bonus true damage                                    | Anti-tank seed           |
| Kata Scroll             | 1   | —                  | +0.1 attack speed, +8 move speed  | **Footwork**: after a kill, +25 move speed for 3s                                     | Chase                    |
| Cogged Edge             | 2   | Cleaver + Gauntlet | +24 Blade, +0.2 attack speed      | **Ratchet**: each hit on the same hero grants +4% attack speed for 3s, up to 5 stacks | Sustained duel           |
| Duelist's Form          | 2   | Drill + Kata       | +20 Blade, +10 move speed         | **Riposte**: when a hero hits you, +40 Blade for 2s (6s)                              | Counter-attacker         |
| Bloodletter Hook        | 2   | Fang + Cleaver     | +18 Blade                         | **Open Veins**: hits on heroes bleed 12 Blade/s for 3s, and you heal 8% of hit damage | Attrition                |
| Windstep Geta           | 2   | Gauntlet + Kata    | +0.2 attack speed, +14 move speed | **Slip**: falling below 50% health dashes you 80 away from your attacker (12s)        | Escape artist            |
| **Soot Reaver**         | 3   | Cogged Edge        | +45 Blade, +0.3 attack speed      | **Cinder Wake**: every 3rd hit cleaves all enemies within 120 for 60% Blade           | Wave and teamfight carry |
| **The Single Cut**      | 3   | Duelist's Form     | +50 Blade                         | **One Stroke**: hits on heroes below 15% health execute them (true damage)            | The finisher             |
| **Hundred-Hand Ledger** | 3   | Hook + Geta        | +30 Blade, +0.35 attack speed     | **Settled Accounts**: kills cut all your cooldowns by 8s and heal 15% max health      | Reset machine            |

→ descriptions:

- Rusted Cleaver: `{m|+10 Blade}. {r|Chop}: hits on minions and camps deal {m|+20% Blade}.`
- Piston Gauntlet: `{m|+0.15 attack speed}. {r|Wind-up}: every 4th hit strikes twice.`
- Leech Fang: `{m|+6 Blade}. {r|Feed}: {b|heal} for 10% of {m|Blade damage} dealt.`
- Whetstone Drill: `{m|+8 Blade}. {r|Honed}: hits on heroes deal {t|8 true damage}.`
- Kata Scroll: `{m|+0.1 attack speed}, {m|+8 move speed}. {r|Footwork}: after a kill, {m|+25 move speed} for 3s.`
- Cogged Edge: `{m|+24 Blade}, {m|+0.2 attack speed}. {r|Ratchet}: each hit on the same hero grants {m|+4% attack speed} for 3s, up to 5 times.`
- Duelist's Form: `{m|+20 Blade}, {m|+10 move speed}. {r|Riposte}: when a hero hits you, {m|+40 Blade} for 2s. {r|6s cooldown}.`
- Bloodletter Hook: `{m|+18 Blade}. {r|Open Veins}: hits on heroes {m|bleed 12 Blade/s} for 3s and {b|heal} you for 8% of the hit.`
- Windstep Geta: `{m|+0.2 attack speed}, {m|+14 move speed}. {r|Slip}: dropping below {b|50% health} dashes you away from your attacker. {r|12s cooldown}.`
- Soot Reaver: `{m|+45 Blade}, {m|+0.3 attack speed}. {r|Cinder Wake}: every 3rd hit {m|cleaves} all enemies nearby for {m|60% Blade}.`
- The Single Cut: `{m|+50 Blade}. {r|One Stroke}: hits on heroes below {b|15% health} {t|execute} them.`
- Hundred-Hand Ledger: `{m|+30 Blade}, {m|+0.35 attack speed}. {r|Settled Accounts}: kills cut {s|all cooldowns by 8s} and {b|heal 15% max health}.`

### Body: the vessel (moss and verdigris)

| Item                   | T   | From             | Stats                       | Rule                                                                                             | Identity              |
| ---------------------- | --- | ---------------- | --------------------------- | ------------------------------------------------------------------------------------------------ | --------------------- |
| Iron Lung              | 1   | —                | +150 health                 | **Deep Breath**: after 4s out of combat, regen 2% max health/s                                   | Lane staying power    |
| Riveted Plate          | 1   | —                | +14 armor                   | **Plating**: −5% damage taken                                                                    | Pure toughness        |
| Wanderer's Boots       | 1   | —                | +12 move speed              | **Roadworn**: after 3s out of combat, +20 move speed                                             | Rotations             |
| Stitched Poultice      | 1   | —                | +60 health, +3 regen        | **Stitches**: below 40% health, +12 regen for 5s (20s)                                           | Comeback heal         |
| Tin Ward               | 1   | —                | +80 health                  | **Clang**: when a hero hits you, gain a 60 shield for 3s (12s)                                   | Anti-burst            |
| Boiler Heart           | 2   | Lung + Plate     | +350 health, +16 armor      | **Pressure Valve**: every 8s in combat, deal 40 Soul damage around you and heal 3% max health    | Brawler core          |
| Ward-Bell Cuirass      | 2   | Ward + Plate     | +28 armor, +12 resist       | **Toll**: when a hero hits you, you and allies within 150 gain a 70 shield (14s)                 | Team protector        |
| Mender's Ledger        | 2   | Lung + Poultice  | +260 health, +5 regen       | **Second Wind**: below 40% health, heal 20% max health over 4s (40s)                             | Survive the gank      |
| Runaway's Greaves      | 2   | Boots + Ward     | +130 health, +16 move speed | **Flight**: when damaged, +30 move speed for 2s (6s)                                             | Kite and escape       |
| **Furnace Bastion**    | 3   | Boiler Heart     | +600 health, +24 armor      | **Forge Skin**: attackers take 45 Blade damage (1.5s each), and allies within 200 gain +10 armor | Frontline anchor      |
| **Pocket Vault Shell** | 3   | Ward-Bell        | +500 health, +30 armor      | **The Vault**: once per life, lethal damage leaves you at 1 health inside a 300 shield for 2s    | Cheat death           |
| **Undying Larder**     | 3   | Ledger + Greaves | +520 health, +8 regen       | **Larder**: kills heal 15% max health; below 30% health, regen ×4 for 5s (30s)                   | Unkillable skirmisher |

→ descriptions:

- Iron Lung: `{b|+150 health}. {r|Deep Breath}: after 4s out of combat, {b|regen 2% max health} per second.`
- Riveted Plate: `{b|+14 armor}. {r|Plating}: {b|−5% damage taken}.`
- Wanderer's Boots: `{m|+12 move speed}. {r|Roadworn}: after 3s out of combat, {m|+20 move speed}.`
- Stitched Poultice: `{b|+60 health}, {b|+3 regen}. {r|Stitches}: below {b|40% health}, {b|+12 regen} for 5s. {r|20s cooldown}.`
- Tin Ward: `{b|+80 health}. {r|Clang}: when a hero hits you, gain a {b|60 shield} for 3s. {r|12s cooldown}.`
- Boiler Heart: `{b|+350 health}, {b|+16 armor}. {r|Pressure Valve}: every 8s in combat, deal {s|40 Soul damage} around you and {b|heal 3% max health}.`
- Ward-Bell Cuirass: `{b|+28 armor}, {s|+12 resist}. {r|Toll}: when a hero hits you, you and nearby allies gain a {b|70 shield}. {r|14s cooldown}.`
- Mender's Ledger: `{b|+260 health}, {b|+5 regen}. {r|Second Wind}: below {b|40% health}, {b|heal 20% max health} over 4s. {r|40s cooldown}.`
- Runaway's Greaves: `{b|+130 health}, {m|+16 move speed}. {r|Flight}: when damaged, {m|+30 move speed} for 2s.`
- Furnace Bastion: `{b|+600 health}, {b|+24 armor}. {r|Forge Skin}: attackers take {m|45 Blade damage}; nearby allies gain {b|+10 armor}.`
- Pocket Vault Shell: `{b|+500 health}, {b|+30 armor}. {r|The Vault}: {r|once per life}, lethal damage leaves you at {b|1 health} inside a {b|300 shield}.`
- Undying Larder: `{b|+520 health}, {b|+8 regen}. {r|Larder}: kills {b|heal 15% max health}; below {b|30% health}, {b|regen ×4} for 5s.`

Move speed is a Mind keyword even on Body items: the color follows the stat, not the item. That is deliberate, and it is what makes hybrid items readable at a glance.

### Soul: the spirit and its price (lantern violet)

| Item                           | T   | From            | Stats                                   | Rule                                                                                                               | Identity            |
| ------------------------------ | --- | --------------- | --------------------------------------- | ------------------------------------------------------------------------------------------------------------------ | ------------------- |
| Candle Stub                    | 1   | —               | +12 Soul power                          | **Wax**: each kill grants +2 Soul power for the rest of the phase (max +20)                                        | Snowball seed       |
| Spirit Lens                    | 1   | —               | +12 resist, +8% cooldown reduction      | **Refraction**: when Soul damage hits you, gain a 40 shield for 2s (10s)                                           | Anti-mage           |
| Ashen Amulet                   | 1   | —               | +6 Soul power, +70 health               | **Ember**: below 50% health, +15 Soul power for 4s (15s)                                                           | Desperation         |
| Bottled Hour                   | 1   | —               | +12% cooldown reduction                 | **Spare Minute**: every 20s, all your cooldowns tick 2s                                                            | Ability spam        |
| Pinprick Votive                | 1   | —               | +6 Soul power                           | **Pinprick**: every 5s, the nearest enemy hero takes 14 + 25% Soul damage                                          | Poke                |
| Séance Prism                   | 2   | Candle + Lens   | +28 Soul power, +12% cooldown reduction | **Spirit Call**: kills grant +25 Soul power for 8s                                                                 | Burst chain         |
| Pocket Reliquary               | 2   | Amulet + Hour   | +20 Soul power, +160 health             | **Reliquary**: every 10s, a shield of 20 + 40% Soul power for 3s                                                   | Durable caster      |
| Wishgranter's Receipt          | 2   | Votive + Candle | +38 Soul power, **−80 health**          | **Paid in Full**: every 8s, the nearest enemy hero takes 25 + 30% Soul damage, and you **lose 15 health**          | Power at a price    |
| Shuttered Door                 | 2   | Lens + Hour     | +14 resist, +16% cooldown reduction     | **Shut**: below 35% health, gain a 120 + 50% Soul shield (30s)                                                     | Caster safety       |
| **Eternal Wick**               | 3   | Séance Prism    | +55 Soul power, +16% cooldown reduction | **Never Out**: kills cut all your cooldowns by 6s                                                                  | Reset caster        |
| **Furnished Pocket Dimension** | 3   | Reliquary       | +45 Soul power, +260 health             | **Spare Room**: every 12s, you and allies within 200 gain a 60 + 60% Soul shield                                   | Team shield battery |
| **Locked Cabinet of Wishes**   | 3   | Receipt + Door  | +60 Soul power, +14% cooldown reduction | **Every Wish Is Paid For**: every 5s, enemies within 220 take 30 + 35% Soul damage, and you **lose 2% max health** | The bargain         |

→ descriptions:

- Candle Stub: `{s|+12 Soul power}. {r|Wax}: each kill grants {s|+2 Soul power} for the rest of the phase, up to {s|+20}.`
- Spirit Lens: `{s|+12 resist}, {s|+8% cooldown reduction}. {r|Refraction}: when {s|Soul damage} hits you, gain a {b|40 shield}. {r|10s cooldown}.`
- Ashen Amulet: `{s|+6 Soul power}, {b|+70 health}. {r|Ember}: below {b|50% health}, {s|+15 Soul power} for 4s. {r|15s cooldown}.`
- Bottled Hour: `{s|+12% cooldown reduction}. {r|Spare Minute}: every 20s, {s|all cooldowns tick 2s}.`
- Pinprick Votive: `{s|+6 Soul power}. {r|Pinprick}: every 5s, the nearest enemy hero takes {s|14 + 25% Soul damage}.`
- Séance Prism: `{s|+28 Soul power}, {s|+12% cooldown reduction}. {r|Spirit Call}: kills grant {s|+25 Soul power} for 8s.`
- Pocket Reliquary: `{s|+20 Soul power}, {b|+160 health}. {r|Reliquary}: every 10s, gain a {b|shield} of {s|20 + 40% Soul power}.`
- Wishgranter's Receipt: `{s|+38 Soul power}, {p|−80 health}. {r|Paid in Full}: every 8s, the nearest enemy hero takes {s|25 + 30% Soul damage} and you {p|lose 15 health}.`
- Shuttered Door: `{s|+14 resist}, {s|+16% cooldown reduction}. {r|Shut}: below {b|35% health}, gain a {b|shield} of {s|120 + 50% Soul power}. {r|30s cooldown}.`
- Eternal Wick: `{s|+55 Soul power}, {s|+16% cooldown reduction}. {r|Never Out}: kills cut {s|all cooldowns by 6s}.`
- Furnished Pocket Dimension: `{s|+45 Soul power}, {b|+260 health}. {r|Spare Room}: every 12s, you and nearby allies gain a {b|shield} of {s|60 + 60% Soul power}.`
- Locked Cabinet of Wishes: `{s|+60 Soul power}, {s|+14% cooldown reduction}. {r|Every Wish Is Paid For}: every 5s, nearby enemies take {s|30 + 35% Soul damage} and you {p|lose 2% max health}.`

### Cursed and holy items

Apply the same markup to `content/items/cursed.json` and `holy.json`:

- **Cursed items:** boons use their stat colors, and flaws use `{p|…}`. Prefix each flaw with the rule word `{r|The price}:`.
- **Holy items:** use the stat colors, and draw their tiles with the gold Relic rim.

---

## 4. Visual application beyond text

- **Tiles:**
  - tier 1: `--x-1` border
  - tier 2: `--x` border plus a faint inner glow
  - Relic: `--x-3` border plus a 1px brass outer rim, and the rule name shown under the item name in `--x-3`.
- **Detail panel:** the header bar is tinted with the category hue at 12% opacity. The rule renders as its own line, starting with the brass rule word.
- **Map and HUD:** the item icon in the player card and scoreboard uses the category hue, so a carry's mind-blue build or a tank's moss build reads at a glance.
- **Attunement pips** use the category hue.

## 5. Balance notes for implementation

- **Stat budgets:** tier 3 base stats fall about 10% because the Relic rule carries value. Expect Mind carries to lose some raw damage and gain burst or cleave, Body items to gain a lot (Vault, Bastion aura), and Soul Relics to swing hardest.
- **After implementing:** run `npm run balance -- --matches 800`. Tune the rule numbers first and the base stats second, and keep hero win rates within 45–55%.
- **AI shopping:** no change is needed. Build lists keep their ids.
- **Tests:** add one test per new engine addition (`vs`, `everyNth`, `maxStacks`, `outOfCombat`, `execute`, `lastStand`, `cooldownTick`). Also add a content test that every item `desc` parses, and that its plain text contains its rule name.
