/**
 * Anthropic Claude Mock — Phase 6a (2026-05-23)
 *
 * Monkey-patches a real `Anthropic` SDK client so calls to
 * `anthropic.messages.create()` return canned, realistic-looking JSON
 * instead of reaching api.anthropic.com. Only mounted when
 * `MOCK_EXTERNAL_SERVICES === 'true'` (see services/claude.ts).
 *
 * The SWMS code path in services/claude.ts invokes Claude with a single
 * user message and then parses the response body as JSON (hazards array,
 * controls object, risk-assessment array, etc.). The mock inspects the
 * prompt text to decide which canned payload to return.
 *
 * Realism: the canned hazards/controls follow NZ-trade idioms and align
 * with the static `getDefaultHazards()` table in services/claude.ts so
 * the demo output looks coherent with the offline-fallback path. The mock
 * goes a bit further than the static table (more hazards per trade, full
 * hierarchy-of-controls coverage) so demos can show off the AI surface.
 *
 * Trade keys supported (case-insensitive substring match in the prompt):
 *   plumber, electrician, builder, landscaper, painter
 *
 * Falls back to "builder" when no trade match is found.
 */

import type Anthropic from '@anthropic-ai/sdk';

// ---------------------------------------------------------------------------
// Canned hazard sets — 5 NZ-realistic hazards per trade
// ---------------------------------------------------------------------------

const CANNED_HAZARDS: Record<string, string[]> = {
  plumber: [
    'Live electrical fittings near water supply lines in kitchen/bathroom rough-ins',
    'Confined space entry to subfloor crawlspace — limited oxygen and movement',
    'Exposure to raw sewage and biological hazards when clearing blocked drains',
    'Hot water / steam burns from pressurised hot-water cylinders during isolation',
    'Manual handling injuries lifting cast-iron drainage pipe and ceramic toilet pans',
  ],
  electrician: [
    'Live mains testing on switchboards without proven isolation (HSWA s.36 PCBU duty)',
    'Arc flash / blast from short-circuit fault on commercial-grade switchgear',
    'Working at height on extension ladders to reach roof-mounted solar inverters',
    'Contact with asbestos in pre-2000 switchboards or under-floor wiring runs',
    'Underground service strike — buried HV cable not located by service before excavation',
  ],
  builder: [
    'Falls from height on scaffolding above 3m without compliant edge protection',
    'Struck by falling materials when working below an active framing crew',
    'Silica dust inhalation when cutting concrete, masonry, or fibre-cement sheeting',
    'Power tool injuries — kickback from circular saws, table saws, drop saws',
    'Manual handling of structural timber and gib sheets exceeding 25kg single-person limit',
  ],
  landscaper: [
    'Cuts and amputation hazards from chainsaws, hedge trimmers, and mowers',
    'UV exposure causing skin cancer risk on extended outdoor work (NZ has highest melanoma rate)',
    'Manual handling of pavers, sleepers, and topsoil exceeding 25kg',
    'Underground service strike when digging — power, water, fibre, gas',
    'Hearing damage from prolonged exposure to >85dB equipment (mulchers, blowers, mowers)',
  ],
  painter: [
    'Falls from ladders and trestles when cutting in to eaves and high gables',
    'Respiratory exposure to VOCs and isocyanates from solvent-based paints',
    'Lead paint exposure on pre-1980 weatherboards during prep / sanding',
    'Eye injuries from paint splash and high-pressure airless spray equipment',
    'Slips on overspray, dropsheets, and wet-coat surfaces',
  ],
};

// ---------------------------------------------------------------------------
// Canned control measures — hierarchy of controls per hazard
// ---------------------------------------------------------------------------

interface MockControl {
  primaryControl: string;
  controlType: 'elimination' | 'substitution' | 'engineering' | 'administrative' | 'ppe';
  additionalControls: string[];
  ppeRequired: string[];
  regulationReference?: string;
}

function controlsForHazards(hazards: string[]): Record<string, MockControl> {
  const out: Record<string, MockControl> = {};
  hazards.forEach((hazard, idx) => {
    // Cycle through the hierarchy so a single SWMS shows the full
    // elimination → substitution → engineering → administrative → PPE arc.
    const cycle: MockControl['controlType'][] = [
      'elimination',
      'substitution',
      'engineering',
      'administrative',
      'ppe',
    ];
    const controlType = cycle[idx % cycle.length];

    const primaryByType: Record<MockControl['controlType'], string> = {
      elimination:
        'Eliminate the hazard at source — redesign the task or remove the energised/hazardous element entirely',
      substitution:
        'Substitute the hazardous material or method with a safer alternative (e.g. low-VOC paints, battery tools)',
      engineering:
        'Engineering controls — physical isolation, barriers, RCD/RCBO protection, mechanical ventilation',
      administrative:
        'Administrative controls — permit-to-work, isolation procedure, toolbox talk, work-sequence sign-off',
      ppe: 'PPE as last-resort control — specified for the task per AS/NZS standards',
    };

    out[hazard] = {
      primaryControl: primaryByType[controlType],
      controlType,
      additionalControls: [
        'Pre-start risk briefing with all workers on site',
        'Visible signage and barriers around the work area',
        'Trained-and-competent person sign-off before commencement',
      ],
      ppeRequired: [
        'AS/NZS 1801 hard hat',
        'AS/NZS 1336 safety glasses',
        'AS/NZS 2210.3 safety boots',
        'AS/NZS 4602.1 hi-vis clothing',
      ],
      regulationReference:
        'Health and Safety at Work Act 2015 + WorkSafe NZ Good Practice Guidelines',
    };
  });
  return out;
}

// ---------------------------------------------------------------------------
// Risk assessment canned payload
// ---------------------------------------------------------------------------

interface MockRiskRow {
  hazard: string;
  potentialHarm: string;
  likelihood: number;
  consequence: number;
  riskRating: number;
  controls: string[];
  residualLikelihood: number;
  residualConsequence: number;
  residualRisk: number;
}

function riskAssessmentFor(hazards: string[]): MockRiskRow[] {
  return hazards.map((hazard, idx) => {
    const likelihood = ((idx % 5) + 1) as 1 | 2 | 3 | 4 | 5;
    const consequence = (((idx + 2) % 5) + 1) as 1 | 2 | 3 | 4 | 5;
    return {
      hazard,
      potentialHarm:
        'Serious injury or fatality to worker; downstream injury to co-workers and public if event escalates',
      likelihood,
      consequence,
      riskRating: likelihood * consequence,
      controls: [
        'Isolation and lockout/tagout procedure',
        'Pre-start hazard inspection',
        'Continuous on-site supervision by competent person',
        'PPE per AS/NZS standards',
      ],
      residualLikelihood: 1,
      residualConsequence: Math.max(1, consequence - 2),
      residualRisk: Math.max(1, consequence - 2),
    };
  });
}

// ---------------------------------------------------------------------------
// Prompt classifier — figure out which canned response to return
// ---------------------------------------------------------------------------

function detectTrade(promptText: string): string {
  const lower = promptText.toLowerCase();
  for (const trade of Object.keys(CANNED_HAZARDS)) {
    if (lower.includes(trade)) {
      return trade;
    }
  }
  return 'builder';
}

function isHazardPrompt(p: string): boolean {
  // Current claude.ts: "suggest SWMS hazards" + "JSON array of hazard strings"
  // Legacy: "JSON array" + hazard without control-measures framing
  if (/suggest SWMS hazards/i.test(p)) return true;
  return /hazard/i.test(p) && /json array/i.test(p) && !/control/i.test(p.split('Example')[0] ?? p);
}

function isControlsPrompt(p: string): boolean {
  return /hierarchy of controls/i.test(p) || /control measures?/i.test(p);
}

function isRiskAssessmentPrompt(p: string): boolean {
  return /risk assessment/i.test(p) && /likelihood/i.test(p);
}

function isValidatePrompt(p: string): boolean {
  return /completenessScore/i.test(p) || /Validate.*SWMS/i.test(p) || /review a SWMS document/i.test(p);
}

function isSectionCompletionPrompt(p: string): boolean {
  // Current: "suggest completions for empty/incomplete fields in a SWMS section"
  // Legacy: "complete a Safe Work Method Statement" + fieldName example
  if (/SWMS section/i.test(p) && /suggest completions/i.test(p)) return true;
  return /complet(?:e|ing) a Safe Work Method Statement/i.test(p) && /fieldName/i.test(p);
}

// Extract hazard list from a controls prompt. Current claude.ts wraps the
// JSON array in <untrusted_user_data label="hazards_json">…</…>.
// Legacy used `Hazards: ${JSON.stringify(hazards)}`.
function extractHazardsFromControlsPrompt(p: string): string[] {
  const patterns = [
    /label="hazards_json">\s*(\[[\s\S]*?\])\s*<\/untrusted_user_data>/,
    /Hazards:\s*(\[[\s\S]*?\])/,
  ];
  for (const re of patterns) {
    const match = p.match(re);
    if (!match) continue;
    try {
      const parsed = JSON.parse(match[1]);
      if (Array.isArray(parsed) && parsed.every((x) => typeof x === 'string')) {
        return parsed as string[];
      }
    } catch {
      // try next pattern
    }
  }
  return [];
}

// ---------------------------------------------------------------------------
// Canned response builder
// ---------------------------------------------------------------------------

function buildCannedResponseText(promptText: string): string {
  // Order matters: the validate and section-completion prompts both contain
  // the substring "control measures", so they MUST be classified before the
  // broad isControlsPrompt() check or they would misroute to a controls map.
  if (isHazardPrompt(promptText)) {
    const trade = detectTrade(promptText);
    const hazards = CANNED_HAZARDS[trade] ?? CANNED_HAZARDS.builder;
    return JSON.stringify(hazards, null, 2);
  }

  if (isRiskAssessmentPrompt(promptText)) {
    const trade = detectTrade(promptText);
    return JSON.stringify(riskAssessmentFor(CANNED_HAZARDS[trade] ?? CANNED_HAZARDS.builder), null, 2);
  }

  if (isValidatePrompt(promptText)) {
    return JSON.stringify(
      {
        isValid: true,
        completenessScore: 87,
        issues: [
          {
            severity: 'warning',
            field: 'controls.emergencyPlan',
            issue: 'Emergency response plan missing nearest hospital address',
            suggestion: 'Add the nearest A&E hospital street address and contact phone number',
          },
        ],
        regulatoryNotes: [
          'PCBU duty under HSWA s.36 — primary duty of care extends to all workers and persons influenced by the work',
          'Refer to WorkSafe NZ "General risk and workplace management" Good Practice Guidelines',
        ],
      },
      null,
      2
    );
  }

  if (isSectionCompletionPrompt(promptText)) {
    return JSON.stringify(
      {
        emergencyPlan:
          'In case of injury: 1) Make area safe 2) Call 111 3) Apply first aid 4) Notify supervisor 5) Record incident',
        toolboxTalkTopics: [
          'Site-specific hazards reviewed',
          'PPE check completed',
          'Emergency procedures confirmed',
        ],
      },
      null,
      2
    );
  }

  // Controls is the broadest matcher (it triggers on "control measures"),
  // so it runs last — after the more specific validate/section classifiers.
  if (isControlsPrompt(promptText)) {
    const extracted = extractHazardsFromControlsPrompt(promptText);
    const hazards =
      extracted.length > 0 ? extracted : CANNED_HAZARDS[detectTrade(promptText)];
    return JSON.stringify(controlsForHazards(hazards), null, 2);
  }

  // Unknown prompt shape — return an empty JSON object so the caller's
  // JSON.parse doesn't blow up. parseJsonResponse() in claude.ts handles
  // this gracefully and falls back to defaults.
  return '{}';
}

// ---------------------------------------------------------------------------
// Install function
// ---------------------------------------------------------------------------

interface MessageCreateParams {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  messages: Array<{ role: string; content: any }>;
  model?: string;
  max_tokens?: number;
}

/**
 * Install mock implementation on an Anthropic SDK client instance.
 * Mutates the client in-place.
 */
export function installClaudeMock(anthropic: Anthropic): Anthropic {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  (anthropic.messages as any).create = async (
    params: MessageCreateParams
  ): Promise<{ content: Array<{ type: 'text'; text: string }>; model: string; stop_reason: string; usage: { input_tokens: number; output_tokens: number } }> => {
    // Concatenate all user-message content into a single string we can
    // pattern-match on. Real SDK accepts string OR an array of content
    // blocks — handle both shapes defensively.
    const promptText = (params.messages ?? [])
      .map((m) => {
        if (typeof m.content === 'string') return m.content;
        if (Array.isArray(m.content)) {
          return m.content
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            .map((c: any) => (typeof c?.text === 'string' ? c.text : ''))
            .join('\n');
        }
        return '';
      })
      .join('\n');

    const text = buildCannedResponseText(promptText);

    console.log(
      `[MockClaude] returning canned response (${text.length} chars) for prompt of ${promptText.length} chars`
    );

    return {
      content: [{ type: 'text', text }],
      model: params.model ?? 'claude-sonnet-4-20250514',
      stop_reason: 'end_turn',
      usage: {
        input_tokens: Math.ceil(promptText.length / 4),
        output_tokens: Math.ceil(text.length / 4),
      },
    };
  };

  return anthropic;
}

export default { installClaudeMock };
