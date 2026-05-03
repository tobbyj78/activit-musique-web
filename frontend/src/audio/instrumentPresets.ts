export type InstrumentPreset = {
  key: string;
  label: string;
  file: string;
  variableName: string;
  copyKey?: string;
};

const ORCHESTRA_BASE = "/webaudiofont/instruments";

export const INSTRUMENT_PRESETS: Record<string, InstrumentPreset> = {
  piano: {
    key: "piano",
    label: "Piano",
    file: "/webaudiofont/instruments/0000_FluidR3_GM_sf2_file.js",
    variableName: "_tone_0000_FluidR3_GM_sf2_file"
  },
  flute: {
    key: "flute",
    label: "Flûte",
    file: `${ORCHESTRA_BASE}/0730_GeneralUserGS_sf2_file.js`,
    variableName: "_tone_0730_GeneralUserGS_sf2_file"
  },
  oboe: {
    key: "oboe",
    label: "Hautbois",
    file: `${ORCHESTRA_BASE}/0680_GeneralUserGS_sf2_file.js`,
    variableName: "_tone_0680_GeneralUserGS_sf2_file"
  },
  clarinet: {
    key: "clarinet",
    label: "Clarinette",
    file: `${ORCHESTRA_BASE}/0710_GeneralUserGS_sf2_file.js`,
    variableName: "_tone_0710_GeneralUserGS_sf2_file"
  },
  bassoon: {
    key: "bassoon",
    label: "Basson",
    file: `${ORCHESTRA_BASE}/0700_GeneralUserGS_sf2_file.js`,
    variableName: "_tone_0700_GeneralUserGS_sf2_file"
  },
  horn: {
    key: "horn",
    label: "Cor",
    file: `${ORCHESTRA_BASE}/0602_GeneralUserGS_sf2_file.js`,
    variableName: "_tone_0602_GeneralUserGS_sf2_file"
  },
  trumpet: {
    key: "trumpet",
    label: "Trompette",
    file: `${ORCHESTRA_BASE}/0560_GeneralUserGS_sf2_file.js`,
    variableName: "_tone_0560_GeneralUserGS_sf2_file"
  },
  trombone: {
    key: "trombone",
    label: "Trombone",
    file: `${ORCHESTRA_BASE}/0570_GeneralUserGS_sf2_file.js`,
    variableName: "_tone_0570_GeneralUserGS_sf2_file"
  },
  timpani: {
    key: "timpani",
    label: "Timbales",
    file: `${ORCHESTRA_BASE}/0470_GeneralUserGS_sf2_file.js`,
    variableName: "_tone_0470_GeneralUserGS_sf2_file"
  },
  violinI: {
    key: "violinI",
    label: "Violons I",
    file: `${ORCHESTRA_BASE}/0402_GeneralUserGS_sf2_file.js`,
    variableName: "_tone_0402_GeneralUserGS_sf2_file"
  },
  violinII: {
    key: "violinII",
    label: "Violons II",
    file: `${ORCHESTRA_BASE}/0402_GeneralUserGS_sf2_file.js`,
    variableName: "_tone_0402_GeneralUserGS_sf2_file",
    copyKey: "violinII"
  },
  viola: {
    key: "viola",
    label: "Altos",
    file: `${ORCHESTRA_BASE}/0410_GeneralUserGS_sf2_file.js`,
    variableName: "_tone_0410_GeneralUserGS_sf2_file"
  },
  cello: {
    key: "cello",
    label: "Violoncelles",
    file: `${ORCHESTRA_BASE}/0420_GeneralUserGS_sf2_file.js`,
    variableName: "_tone_0420_GeneralUserGS_sf2_file"
  },
  contrabass: {
    key: "contrabass",
    label: "Contrebasses",
    file: `${ORCHESTRA_BASE}/0430_GeneralUserGS_sf2_file.js`,
    variableName: "_tone_0430_GeneralUserGS_sf2_file"
  }
};

export const ORCHESTRA_PRESET_KEYS = [
  "flute",
  "oboe",
  "clarinet",
  "bassoon",
  "horn",
  "trumpet",
  "timpani",
  "violinI",
  "violinII",
  "viola",
  "cello",
  "contrabass"
] as const;

export function presetFor(key: string): InstrumentPreset {
  return INSTRUMENT_PRESETS[key] ?? INSTRUMENT_PRESETS.piano;
}
