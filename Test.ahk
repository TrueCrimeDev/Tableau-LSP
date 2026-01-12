## AHK ERROR REPORT

**Copied:** 17:35:35
**Total Errors:** 27

### Grouped (10m window, file|line|errorType)
- CreatureBattle.ahk|| | count: 5 | latest: 2026-01-12 17:35:30
- CreatureBattle.ahk||No value was returned. | count: 2 | latest: 2026-01-12 17:35:32
- CreatureBattle.ahk||This local variable has not been assigned a value. | count: 16 | latest: 2026-01-12 17:35:32
- CreatureBattle.ahk||This value of type "BattleApp" has no property named "playerTeam". | count: 2 | latest: 2026-01-12 17:35:33
- CreatureBattle.ahk||Type mismatch. | count: 2 | latest: 2026-01-12 17:35:33

---

### Error 1

**File:** CreatureBattle.ahk
**Line:** 
**Error:** 
**Details:** Gdip_PenCreate

#### Code Context
    521: Gdip_DeleteBrush(pBrushType2)
    522: }
ERROR HERE >>> 524: pPenOutline := Gdip_PenCreate(0xFFFFFFFF, 3)
    525: Gdip_DrawEllipse(g, pPenOutline, x, y, size, size)
    526: Gdip_DeletePen(pPenOutline)

---

### Error 2

**File:** CreatureBattle.ahk
**Line:** 
**Error:** 
**Details:** Gdip_SetStringFormatLineAlign

#### Code Context
    530: hFormat := Gdip_StringFormatCreate(0x4000)
    531: Gdip_SetStringFormatAlign(hFormat, 1)
ERROR HERE >>> 532: Gdip_SetStringFormatLineAlign(hFormat, 1)
    534: pBrushText := Gdip_BrushCreateSolid((alpha << 24) | 0xFFFFFF)
    536: initial := SubStr(creature.name, 1, 2)

---

### Error 3

**File:** CreatureBattle.ahk
**Line:** 
**Error:** This local variable has not been assigned a value.
**Details:** creature

#### Code Context
    293: }
    294: }
ERROR HERE >>> 296: creature := Creature(name, template["types"].Clone(), level, stats, moves, template["ability"])
    297: creature.baseStats := baseStats
    298: creature.exp := 0

---

### Error 4

**File:** CreatureBattle.ahk
**Line:** 
**Error:** This local variable has not been assigned a value.
**Details:** creature

#### Code Context
    294: }
    296: creature := Creature(name, template["types"].Clone(), level, stats, moves, template["ability"])
ERROR HERE >>> 297: creature.baseStats := baseStats
    298: creature.exp := 0
    299: creature.expToNext := this.CalcExpToNext(level)

---

### Error 5

**File:** CreatureBattle.ahk
**Line:** 
**Error:** This local variable has not been assigned a value.
**Details:** creature

#### Code Context
    296: creature := Creature(name, template["types"].Clone(), level, stats, moves, template["ability"])
    297: creature.baseStats := baseStats
ERROR HERE >>> 298: creature.exp := 0
    299: creature.expToNext := this.CalcExpToNext(level)
    300: creature.evolveLevel := template.Has("evolveLevel") ? template["evolveLevel"] : 0

---

### Error 6

**File:** CreatureBattle.ahk
**Line:** 
**Error:** This local variable has not been assigned a value.
**Details:** creature

#### Code Context
    297: creature.baseStats := baseStats
    298: creature.exp := 0
ERROR HERE >>> 299: creature.expToNext := this.CalcExpToNext(level)
    300: creature.evolveLevel := template.Has("evolveLevel") ? template["evolveLevel"] : 0
    301: creature.evolveTo := template.Has("evolveTo") ? template["evolveTo"] : ""

---

### Error 7

**File:** CreatureBattle.ahk
**Line:** 
**Error:** This local variable has not been assigned a value.
**Details:** creature

#### Code Context
    298: creature.exp := 0
    299: creature.expToNext := this.CalcExpToNext(level)
ERROR HERE >>> 300: creature.evolveLevel := template.Has("evolveLevel") ? template["evolveLevel"] : 0
    301: creature.evolveTo := template.Has("evolveTo") ? template["evolveTo"] : ""
    302: creature.expYield := template["expYield"]

---

### Error 8

**File:** CreatureBattle.ahk
**Line:** 
**Error:** This local variable has not been assigned a value.
**Details:** creature

#### Code Context
    299: creature.expToNext := this.CalcExpToNext(level)
    300: creature.evolveLevel := template.Has("evolveLevel") ? template["evolveLevel"] : 0
ERROR HERE >>> 301: creature.evolveTo := template.Has("evolveTo") ? template["evolveTo"] : ""
    302: creature.expYield := template["expYield"]
    304: Return creature

---

### Error 9

**File:** CreatureBattle.ahk
**Line:** 
**Error:** This local variable has not been assigned a value.
**Details:** creature

#### Code Context
    300: creature.evolveLevel := template.Has("evolveLevel") ? template["evolveLevel"] : 0
    301: creature.evolveTo := template.Has("evolveTo") ? template["evolveTo"] : ""
ERROR HERE >>> 302: creature.expYield := template["expYield"]
    304: Return creature
    305: }

---

### Error 10

**File:** CreatureBattle.ahk
**Line:** 
**Error:** This local variable has not been assigned a value.
**Details:** creature

#### Code Context
    301: creature.evolveTo := template.Has("evolveTo") ? template["evolveTo"] : ""
    302: creature.expYield := template["expYield"]
ERROR HERE >>> 304: Return creature
    305: }
    307: {

---

### Error 11

**File:** CreatureBattle.ahk
**Line:** 
**Error:** No value was returned.
**Details:** .CreateCreature("Pyrox", 25), this.CreateCreature("Aquara", 24), this.CreateCrea…

#### Code Context
    222: }
    224: {
ERROR HERE >>> 225: this.playerTeam := [ this.CreateCreature("Pyrox", 25), this.CreateCreature("Aquara", 24), this.CreateCreature("Voltix", 26) ]
    231: this.playerItems := Map( "Potion", 5, "Super Potion", 2, "Antidote", 3, "Paralyze Heal", 2, "Revive", 1, "Full Restore", 1 )
    240: this.playerMoney := 1000

---

### Error 12

**File:** CreatureBattle.ahk
**Line:** 
**Error:** This value of type "BattleApp" has no property named "playerTeam".

#### Code Context
    246: {
    247: avgLevel := 0
ERROR HERE >>> 248: For c in this.playerTeam
    249: avgLevel += c.level
    250: avgLevel := avgLevel // this.playerTeam.Length

---

### Error 13

**File:** CreatureBattle.ahk
**Line:** 
**Error:** Type mismatch.
**Details:** __Enum

#### Code Context
    246: {
    247: avgLevel := 0
ERROR HERE >>> 248: For c in this.playerTeam
    249: avgLevel += c.level
    250: avgLevel := avgLevel // this.playerTeam.Length

---

### Error 14

**File:** CreatureBattle.ahk
**Line:** 
**Error:** 
**Details:** Gdip_PenCreate

#### Code Context
    522: Gdip_DeleteBrush(pBrushType2)
    523: }
ERROR HERE >>> 525: pPenOutline := Gdip_PenCreate(0xFFFFFFFF, 3)
    526: Gdip_DrawEllipse(g, pPenOutline, x, y, size, size)
    527: Gdip_DeletePen(pPenOutline)

---

### Error 15

**File:** CreatureBattle.ahk
**Line:** 
**Error:** 
**Details:** Gdip_SetStringFormatLineAlign

#### Code Context
    531: hFormat := Gdip_StringFormatCreate(0x4000)
    532: Gdip_SetStringFormatAlign(hFormat, 1)
ERROR HERE >>> 533: Gdip_SetStringFormatLineAlign(hFormat, 1)
    535: pBrushText := Gdip_BrushCreateSolid((alpha << 24) | 0xFFFFFF)
    537: initial := SubStr(creature.name, 1, 2)

---

### Error 16

**File:** CreatureBattle.ahk
**Line:** 
**Error:** 
**Details:** Gdip_PenCreate

#### Code Context
    557: Gdip_FillRoundedRectangle(g, pBrushPanel, x, y, panelW, panelH, 12)
    558: Gdip_DeleteBrush(pBrushPanel)
ERROR HERE >>> 560: pPenBorder := Gdip_PenCreate(0x40FFFFFF, 1)
    561: Gdip_DrawRoundedRectangle(g, pPenBorder, x, y, panelW, panelH, 12)
    562: Gdip_DeletePen(pPenBorder)

---

### Error 17

**File:** CreatureBattle.ahk
**Line:** 
**Error:** This local variable has not been assigned a value.
**Details:** creature

#### Code Context
    294: }
    295: }
ERROR HERE >>> 297: creature := Creature(name, template["types"].Clone(), level, stats, moves, template["ability"])
    298: creature.baseStats := baseStats
    299: creature.exp := 0

---

### Error 18

**File:** CreatureBattle.ahk
**Line:** 
**Error:** This local variable has not been assigned a value.
**Details:** creature

#### Code Context
    295: }
    297: creature := Creature(name, template["types"].Clone(), level, stats, moves, template["ability"])
ERROR HERE >>> 298: creature.baseStats := baseStats
    299: creature.exp := 0
    300: creature.expToNext := this.CalcExpToNext(level)

---

### Error 19

**File:** CreatureBattle.ahk
**Line:** 
**Error:** This local variable has not been assigned a value.
**Details:** creature

#### Code Context
    297: creature := Creature(name, template["types"].Clone(), level, stats, moves, template["ability"])
    298: creature.baseStats := baseStats
ERROR HERE >>> 299: creature.exp := 0
    300: creature.expToNext := this.CalcExpToNext(level)
    301: creature.evolveLevel := template.Has("evolveLevel") ? template["evolveLevel"] : 0

---

### Error 20

**File:** CreatureBattle.ahk
**Line:** 
**Error:** This local variable has not been assigned a value.
**Details:** creature

#### Code Context
    298: creature.baseStats := baseStats
    299: creature.exp := 0
ERROR HERE >>> 300: creature.expToNext := this.CalcExpToNext(level)
    301: creature.evolveLevel := template.Has("evolveLevel") ? template["evolveLevel"] : 0
    302: creature.evolveTo := template.Has("evolveTo") ? template["evolveTo"] : ""

---

### Error 21

**File:** CreatureBattle.ahk
**Line:** 
**Error:** This local variable has not been assigned a value.
**Details:** creature

#### Code Context
    299: creature.exp := 0
    300: creature.expToNext := this.CalcExpToNext(level)
ERROR HERE >>> 301: creature.evolveLevel := template.Has("evolveLevel") ? template["evolveLevel"] : 0
    302: creature.evolveTo := template.Has("evolveTo") ? template["evolveTo"] : ""
    303: creature.expYield := template["expYield"]

---

### Error 22

**File:** CreatureBattle.ahk
**Line:** 
**Error:** This local variable has not been assigned a value.
**Details:** creature

#### Code Context
    300: creature.expToNext := this.CalcExpToNext(level)
    301: creature.evolveLevel := template.Has("evolveLevel") ? template["evolveLevel"] : 0
ERROR HERE >>> 302: creature.evolveTo := template.Has("evolveTo") ? template["evolveTo"] : ""
    303: creature.expYield := template["expYield"]
    305: Return creature

---

### Error 23

**File:** CreatureBattle.ahk
**Line:** 
**Error:** This local variable has not been assigned a value.
**Details:** creature

#### Code Context
    301: creature.evolveLevel := template.Has("evolveLevel") ? template["evolveLevel"] : 0
    302: creature.evolveTo := template.Has("evolveTo") ? template["evolveTo"] : ""
ERROR HERE >>> 303: creature.expYield := template["expYield"]
    305: Return creature
    306: }

---

### Error 24

**File:** CreatureBattle.ahk
**Line:** 
**Error:** This local variable has not been assigned a value.
**Details:** creature

#### Code Context
    302: creature.evolveTo := template.Has("evolveTo") ? template["evolveTo"] : ""
    303: creature.expYield := template["expYield"]
ERROR HERE >>> 305: Return creature
    306: }
    308: {

---

### Error 25

**File:** CreatureBattle.ahk
**Line:** 
**Error:** No value was returned.
**Details:** .CreateCreature("Pyrox", 25), this.CreateCreature("Aquara", 24), this.CreateCrea…

#### Code Context
    223: }
    225: {
ERROR HERE >>> 226: this.playerTeam := [ this.CreateCreature("Pyrox", 25), this.CreateCreature("Aquara", 24), this.CreateCreature("Voltix", 26) ]
    232: this.playerItems := Map( "Potion", 5, "Super Potion", 2, "Antidote", 3, "Paralyze Heal", 2, "Revive", 1, "Full Restore", 1 )
    241: this.playerMoney := 1000

---

### Error 26

**File:** CreatureBattle.ahk
**Line:** 
**Error:** This value of type "BattleApp" has no property named "playerTeam".

#### Code Context
    247: {
    248: avgLevel := 0
ERROR HERE >>> 249: For c in this.playerTeam
    250: avgLevel += c.level
    251: avgLevel := avgLevel // this.playerTeam.Length

---

### Error 27

**File:** CreatureBattle.ahk
**Line:** 
**Error:** Type mismatch.
**Details:** __Enum

#### Code Context
    247: {
    248: avgLevel := 0
ERROR HERE >>> 249: For c in this.playerTeam
    250: avgLevel += c.level
    251: avgLevel := avgLevel // this.playerTeam.Length

---
