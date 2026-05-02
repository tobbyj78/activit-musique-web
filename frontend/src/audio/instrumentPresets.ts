export type InstrumentPreset = {
  key: string;
  label: string;
  file: string;
  variableName: string;
};

export const INSTRUMENT_PRESETS: Record<string, InstrumentPreset> = {
  piano: {
    key: "piano",
    label: "Piano",
    file: "/webaudiofont/instruments/0000_GeneralUserGS_sf2_file.js",
    variableName: "_tone_0000_GeneralUserGS_sf2_file"
  },
  violin: {
    key: "violin",
    label: "Violon",
    file: "/webaudiofont/instruments/0400_GeneralUserGS_sf2_file.js",
    variableName: "_tone_0400_GeneralUserGS_sf2_file"
  },
  viola: {
    key: "viola",
    label: "Alto",
    file: "/webaudiofont/instruments/0410_GeneralUserGS_sf2_file.js",
    variableName: "_tone_0410_GeneralUserGS_sf2_file"
  },
  cello: {
    key: "cello",
    label: "Violoncelle",
    file: "/webaudiofont/instruments/0420_GeneralUserGS_sf2_file.js",
    variableName: "_tone_0420_GeneralUserGS_sf2_file"
  },
  contrabass: {
    key: "contrabass",
    label: "Contrebasse",
    file: "/webaudiofont/instruments/0430_GeneralUserGS_sf2_file.js",
    variableName: "_tone_0430_GeneralUserGS_sf2_file"
  },
  timpani: {
    key: "timpani",
    label: "Timbales",
    file: "/webaudiofont/instruments/0470_GeneralUserGS_sf2_file.js",
    variableName: "_tone_0470_GeneralUserGS_sf2_file"
  },
  trumpet: {
    key: "trumpet",
    label: "Trompette",
    file: "/webaudiofont/instruments/0560_GeneralUserGS_sf2_file.js",
    variableName: "_tone_0560_GeneralUserGS_sf2_file"
  },
  frenchHorn: {
    key: "frenchHorn",
    label: "Cor",
    file: "/webaudiofont/instruments/0600_GeneralUserGS_sf2_file.js",
    variableName: "_tone_0600_GeneralUserGS_sf2_file"
  },
  oboe: {
    key: "oboe",
    label: "Hautbois",
    file: "/webaudiofont/instruments/0680_GeneralUserGS_sf2_file.js",
    variableName: "_tone_0680_GeneralUserGS_sf2_file"
  },
  bassoon: {
    key: "bassoon",
    label: "Basson",
    file: "/webaudiofont/instruments/0700_GeneralUserGS_sf2_file.js",
    variableName: "_tone_0700_GeneralUserGS_sf2_file"
  },
  clarinet: {
    key: "clarinet",
    label: "Clarinette",
    file: "/webaudiofont/instruments/0710_GeneralUserGS_sf2_file.js",
    variableName: "_tone_0710_GeneralUserGS_sf2_file"
  },
  flute: {
    key: "flute",
    label: "Flute",
    file: "/webaudiofont/instruments/0730_GeneralUserGS_sf2_file.js",
    variableName: "_tone_0730_GeneralUserGS_sf2_file"
  }
};

export function presetFor(key: string): InstrumentPreset {
  return INSTRUMENT_PRESETS[key] ?? INSTRUMENT_PRESETS.piano;
}
