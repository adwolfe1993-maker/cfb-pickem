// Lightweight keyword matcher, not an API call -- deliberately kept this
// way rather than calling out to an AI service for something this small,
// consistent with the project's earlier call to skip a Spotify API
// integration too. Always a suggestion, never authoritative -- every call
// site that uses this keeps the emoji in an editable field.
const EMOJI_KEYWORDS: [RegExp, string][] = [
  [/halloween|spooky|costume|scary/i, '🎃'],
  [/thanksgiving|turkey/i, '🦃'],
  [/christmas|holiday season|santa|xmas/i, '🎄'],
  [/rivalry|rival\b/i, '⚔️'],
  [/kickoff|opening week/i, '🏈'],
  [/homecoming/i, '🏠'],
  [/tailgate|tailgating|cookout|bbq/i, '🍔'],
  [/blackout|black ?out/i, '⚫'],
  [/whiteout|white ?out/i, '⚪'],
  [/senior night|seniors/i, '🎓'],
  [/bowl/i, '🥣'],
  [/playoff|championship|title game/i, '🏆'],
  [/comeback|clutch/i, '🔥'],
  [/upset/i, '😱'],
  [/underdog/i, '🐶'],
  [/heat wave|hot one|scorcher/i, '🥵'],
  [/cold|freeze|freezing|arctic/i, '🥶'],
  [/rain|storm|monsoon/i, '🌧️'],
  [/beach|summer/i, '🏖️'],
  [/throwback|retro|\b80s\b|\b90s\b|vintage/i, '📼'],
  [/prime ?time|night game|under the lights/i, '🌙'],
  [/gameday|game day/i, '📺'],
  [/love|valentine/i, '❤️'],
  [/birthday/i, '🎂'],
  [/road trip|travel/i, '🚗'],
  [/party|celebration|celebrate/i, '🎉'],
  [/patriotic|red white and blue|freedom|independence/i, '🇺🇸'],
  [/harvest|fall classic|autumn/i, '🍂'],
  [/spring/i, '🌸'],
  [/space|galaxy|cosmic/i, '🚀'],
  [/pirate/i, '🏴‍☠️'],
  [/western|cowboy|rodeo/i, '🤠'],
  [/villain|evil/i, '😈'],
  [/hero|super/i, '🦸'],
  [/luck|lucky|charm/i, '🍀'],
  [/gold|golden/i, '🏅'],
  [/final|finale|wrap ?up/i, '🎬'],
]

export function suggestThemeEmoji(theme: string): string {
  for (const [pattern, emoji] of EMOJI_KEYWORDS) {
    if (pattern.test(theme)) return emoji
  }
  return '🎵'
}
