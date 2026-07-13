import { STADIUMS, getStadiumConstants } from '@/lib/weather-api'

describe('getStadiumConstants', () => {
  it('returns Fenway Park constants for venueId 3', () => {
    const stadium = getStadiumConstants(3)
    expect(stadium).not.toBeNull()
    expect(stadium!.name).toContain('Fenway')
    expect(stadium!.outfieldFacingDegrees).toBeDefined()
  })

  it('returns null for unknown venueId', () => {
    expect(getStadiumConstants(99999)).toBeNull()
  })

  it('has all 30 stadiums defined', () => {
    expect(Object.keys(STADIUMS).length).toBe(30)
  })

  it('marks roofed parks as weather controlled', () => {
    expect(getStadiumConstants(12)?.weatherControlled).toBe(true)
    expect(getStadiumConstants(15)?.weatherControlled).toBe(true)
  })
})
