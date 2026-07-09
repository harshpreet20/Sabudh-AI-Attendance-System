import type OpenAI from 'openai'

// Shared engagement-nudge content generation, used by both the (optional) server
// cron and the PWA self-nudge endpoint. Produces short, varied, contextual
// re-engagement notifications (random theme + live weather + OpenAI slang).

export const ENGAGEMENT_THEMES = [
  'local_slang', 'weather', 'motivational', 'fomo', 'curiosity', 'friendly_nudge', 'streak',
] as const
export type EngagementTheme = (typeof ENGAGEMENT_THEMES)[number]

export function pick<T>(arr: readonly T[]): T {
  return arr[Math.floor(Math.random() * arr.length)]
}

export function shuffle<T>(arr: T[]): T[] {
  for (let i = arr.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1))
    ;[arr[i], arr[j]] = [arr[j], arr[i]]
  }
  return arr
}

export function firstName(full: string): string {
  return (full || 'there').trim().split(/\s+/)[0]
}

// --- Live weather via open-meteo (no API key) -------------------------------
export async function getWeather(city: string, cache?: Map<string, string | null>): Promise<string | null> {
  const key = city.toLowerCase().trim()
  if (cache?.has(key)) return cache.get(key)!
  let result: string | null = null
  try {
    const geo = await fetch(
      `https://geocoding-api.open-meteo.com/v1/search?name=${encodeURIComponent(city)}&count=1`,
      { signal: AbortSignal.timeout(4000) },
    ).then((r) => r.json())
    const loc = geo?.results?.[0]
    if (loc) {
      const wx = await fetch(
        `https://api.open-meteo.com/v1/forecast?latitude=${loc.latitude}&longitude=${loc.longitude}&current=temperature_2m,weather_code`,
        { signal: AbortSignal.timeout(4000) },
      ).then((r) => r.json())
      const t = wx?.current?.temperature_2m
      const code = wx?.current?.weather_code
      if (t != null) result = `${Math.round(t)}°C, ${weatherCodeText(code)}`
    }
  } catch {
    result = null
  }
  cache?.set(key, result)
  return result
}

function weatherCodeText(code: number | undefined): string {
  if (code == null) return 'clear'
  if (code === 0) return 'clear skies'
  if (code <= 3) return 'partly cloudy'
  if (code <= 48) return 'foggy'
  if (code <= 67) return 'rainy'
  if (code <= 77) return 'snowy'
  if (code <= 82) return 'rain showers'
  if (code <= 99) return 'thunderstorms'
  return 'mixed weather'
}

export interface EngagementInput {
  name: string
  city: string
  theme: EngagementTheme
  weather: string | null
}

export async function generateEngagementMessage(
  openai: OpenAI | null,
  input: EngagementInput,
): Promise<{ title: string; body: string }> {
  if (!openai) return engagementFallback(input)
  try {
    const styleGuide: Record<EngagementTheme, string> = {
      local_slang: `Lean into cheeky local flavour for ${input.city || 'their city'}, but the punchline is still: get up and learn.`,
      weather: input.weather ? `Riff on today's weather in ${input.city} (${input.weather}) as an excuse-buster to open the app and study.` : 'Riff on the time of day/season as a no-excuses reason to study now.',
      motivational: 'Sharp, momentum-driven pep talk from someone who has actually built AI careers.',
      fomo: 'Cheeky FOMO about the class, assignment and skills they are letting slip.',
      curiosity: 'Tease that something worth learning is waiting — make them curious enough to log in.',
      friendly_nudge: 'Warm but savage, like a mentor who refuses to let them coast.',
      streak: 'Guilt-trip (lovingly) about breaking their learning streak/consistency.',
    }
    // Vary the language for texture: mostly English, sometimes Romanized Punjabi.
    const lang = Math.random() < 0.6
      ? 'English'
      : 'Romanized Punjabi (Punjabi written in English/Roman script — NEVER Gurmukhi/Devanagari)'

    const prompt = `You write push notifications for "Sabudh AI" — a hands-on AI/coding/data-science UPSKILLING and attendance app for students.

Persona: fuse the razor-sharp, punny wit of Zomato's famous notifications with the hard-earned insight of an AI CEO with 30+ years in the field. Clever, cheeky, a little savage — high-IQ, never generic, never cringe.

Hard rules:
- Language: write in ${lang} ONLY. Keep it readable and natural.
- Topic: STRICTLY education / upskilling / attendance / doing the assignment / showing up to learn. Nothing off-topic, no fluff.
- Core truth to land: real upskilling is on THEM — "AI upskilling" does NOT mean the AI does your assignment for you. Nudge them to LOGIN and actually attend / finish the work / learn.
- Flavour for this one: ${styleGuide[input.theme]}
- Student first name: ${input.name}. City: ${input.city || 'unknown'}.
- Body max 18 words. Title max 4 words. At most one emoji, only if it lands.

Vibe examples (do NOT copy, match the energy):
- "AI won't attend class for you. Login and mark attendance, genius. 🎯"
- "Upskilling ≠ ChatGPT doing your homework. Open the app, finish that assignment."
- "Oye scholar, assignment khud karni ae. Login kar te kamm mukka."

Return ONLY compact JSON: {"title":"...","body":"..."}`

    const completion = await openai.chat.completions.create({
      model: 'gpt-4o-mini',
      messages: [{ role: 'user', content: prompt }],
      max_tokens: 90,
      temperature: 1.05,
    })
    const raw = completion.choices[0]?.message?.content?.trim() || ''
    const json = JSON.parse(raw.replace(/^```json/i, '').replace(/```$/, '').trim())
    if (json.title && json.body) {
      return { title: String(json.title).slice(0, 60), body: String(json.body).slice(0, 180) }
    }
  } catch {
    // fall through to fallback
  }
  return engagementFallback(input)
}

// Witty, education-directed fallbacks (English + Romanized Punjabi) used when
// OpenAI is unavailable. Same persona: cheeky but strictly about doing the work.
export function engagementFallback(input: EngagementInput): { title: string; body: string } {
  const options: Array<{ title: string; body: string }> = [
    { title: 'Nice try', body: `${input.name}, AI won't do your assignment for you. Login and finish it. 🎯` },
    { title: 'Oye scholar', body: `Assignment khud karni ae, ${input.name}. Login kar te kamm mukka.` },
    { title: 'Skills > excuses', body: `Upskilling ≠ ChatGPT homework, ${input.name}. Open Sabudh AI, attend, learn.` },
    { title: 'Class calling', body: `${input.name}, your future self is upskilling. Mark attendance, do the work.` },
    { title: 'Login karo', body: `${input.name}, kise ne skills free wich nahi dittiyan. Login kar, seekh.` },
  ]
  return pick(options)
}
