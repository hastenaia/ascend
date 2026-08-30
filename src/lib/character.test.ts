import { describe, expect, it } from "vitest"
import { attributeFromXp, computeCharacterAttributes, momentumMessage } from "@/lib/character"

describe("attributeFromXp", () => {
  it("is honest at zero", () => {
    expect(attributeFromXp(0)).toBe(0)
    expect(attributeFromXp(-5)).toBe(0)
  })

  it("matches the documented curve", () => {
    // 99 * sqrt(600) / sqrt(600 + 600) = 99 * sqrt(0.5)
    expect(attributeFromXp(600)).toBe(70)
  })

  it("is monotonic and asymptotic below 99", () => {
    expect(attributeFromXp(10)).toBeLessThan(attributeFromXp(600))
    expect(attributeFromXp(1_000_000_000)).toBe(99)
  })
})

describe("computeCharacterAttributes", () => {
  it("maps category XP through each attribute source", () => {
    // Each category contributes 600 XP → single-source attrs = attributeFromXp(600) = 70,
    // two-source attrs = attributeFromXp(1200) = 81, three-source = attributeFromXp(1800) = 86.
    const xp = { physical: 600, intellect: 600, discipline: 600, reflection: 600, craft: 600, work: 600, general: 600 }
    const attrs = computeCharacterAttributes(xp)
    expect(attrs.physical).toBe(70) // physical
    expect(attrs.mental).toBe(81) // discipline + reflection
    expect(attrs.intellect).toBe(81) // intellect + craft
    expect(attrs.eq).toBe(81) // reflection + general
    expect(attrs.discipline).toBe(81) // discipline + work
    expect(attrs.knowledge).toBe(86) // intellect + work + craft
  })

  it("returns zeroed attributes without data", () => {
    const attrs = computeCharacterAttributes({})
    expect(attrs).toEqual({
      physical: 0,
      mental: 0,
      intellect: 0,
      eq: 0,
      discipline: 0,
      knowledge: 0,
    })
  })
})

describe("momentumMessage", () => {
  it("tiers messages by streak", () => {
    expect(momentumMessage(0, 0)).toBe("Every ascent starts with one quest.")
    expect(momentumMessage(1, 10)).toBe("You've started something — keep the thread.")
    expect(momentumMessage(3, 40)).toBe("You're building consistency.")
    expect(momentumMessage(8, 80)).toBe("Remarkable consistency. This is who you are now.")
  })
})