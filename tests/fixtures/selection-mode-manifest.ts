import type {
  ElementSelectionBoundary,
  ExactExportTarget,
  RegionSelectionBoundary,
  SelectionInvalidBoundaryReason,
  SelectionUnsupportedSurfaceReason
} from '@pagemint/shared-types';

export type SelectionModeFixtureId =
  | 'valid-element-card'
  | 'valid-region-chart'
  | 'invalid-ambiguous-element'
  | 'invalid-multiple-regions'
  | 'invalid-region-outside-page'
  | 'unsupported-browser-surface';

interface SelectionModeFixtureValidationSuccess {
  ok: true;
}

interface SelectionModeFixtureInvalidBoundary {
  ok: false;
  outcome: 'invalid-boundary';
  reason: SelectionInvalidBoundaryReason;
}

interface SelectionModeFixtureUnsupportedSurface {
  ok: false;
  outcome: 'unsupported-surface';
  reason: SelectionUnsupportedSurfaceReason;
}

export type SelectionModeFixtureValidation =
  | SelectionModeFixtureValidationSuccess
  | SelectionModeFixtureInvalidBoundary
  | SelectionModeFixtureUnsupportedSurface;

interface SelectionModeFixtureBase {
  id: SelectionModeFixtureId;
  label: string;
  description: string;
  target: ExactExportTarget;
  boundaryCount?: number;
  validation: SelectionModeFixtureValidation;
}

export interface ElementSelectionModeFixtureDefinition extends SelectionModeFixtureBase {
  requestKind: 'element';
  boundary: ElementSelectionBoundary;
}

export interface RegionSelectionModeFixtureDefinition extends SelectionModeFixtureBase {
  requestKind: 'region';
  boundary: RegionSelectionBoundary;
}

export type SelectionModeFixtureDefinition =
  | ElementSelectionModeFixtureDefinition
  | RegionSelectionModeFixtureDefinition;

export const selectionModeFixtureManifest = [
  {
    id: 'valid-element-card',
    label: 'Valid element card',
    description: 'One bounded dashboard card on the active page should validate cleanly.',
    requestKind: 'element',
    target: {
      url: 'https://example.com/dashboard',
      title: 'Revenue dashboard'
    },
    boundary: {
      kind: 'element',
      bounds: {
        x: 96,
        y: 180,
        width: 720,
        height: 360
      },
      pageBounds: {
        x: 0,
        y: 0,
        width: 1440,
        height: 2800
      },
      element: {
        tagName: 'section',
        role: 'region',
        label: 'Revenue summary panel',
        textPreview: 'Revenue up 19% year over year'
      }
    },
    validation: {
      ok: true
    }
  },
  {
    id: 'valid-region-chart',
    label: 'Valid region chart',
    description: 'One drag-selected chart region within the active page stays valid and inspectable.',
    requestKind: 'region',
    target: {
      url: 'https://example.com/reports/q1',
      title: 'Q1 report'
    },
    boundary: {
      kind: 'region',
      bounds: {
        x: 120,
        y: 240,
        width: 840,
        height: 540
      },
      pageBounds: {
        x: 0,
        y: 0,
        width: 1440,
        height: 3200
      },
      anchor: {
        x: 120,
        y: 240
      },
      focus: {
        x: 960,
        y: 780
      }
    },
    validation: {
      ok: true
    }
  },
  {
    id: 'invalid-ambiguous-element',
    label: 'Ambiguous element boundary',
    description: 'A missing inspectable element tag should fail as an ambiguous element boundary.',
    requestKind: 'element',
    target: {
      url: 'https://example.com/dashboard',
      title: 'Revenue dashboard'
    },
    boundary: {
      kind: 'element',
      bounds: {
        x: 96,
        y: 180,
        width: 720,
        height: 360
      },
      pageBounds: {
        x: 0,
        y: 0,
        width: 1440,
        height: 2800
      },
      element: {
        tagName: '',
        role: 'region',
        label: 'Unknown panel'
      }
    },
    validation: {
      ok: false,
      outcome: 'invalid-boundary',
      reason: 'ambiguous-boundary'
    }
  },
  {
    id: 'invalid-multiple-regions',
    label: 'Multiple region candidates',
    description: 'More than one candidate region must fail because selection stays bounded to one active-page selection.',
    requestKind: 'region',
    target: {
      url: 'https://example.com/reports/q1',
      title: 'Q1 report'
    },
    boundaryCount: 2,
    boundary: {
      kind: 'region',
      bounds: {
        x: 120,
        y: 240,
        width: 840,
        height: 540
      },
      pageBounds: {
        x: 0,
        y: 0,
        width: 1440,
        height: 3200
      },
      anchor: {
        x: 120,
        y: 240
      },
      focus: {
        x: 960,
        y: 780
      }
    },
    validation: {
      ok: false,
      outcome: 'invalid-boundary',
      reason: 'multiple-boundaries'
    }
  },
  {
    id: 'invalid-region-outside-page',
    label: 'Region outside active page',
    description: 'Selections that extend outside the active page bounds must fail honestly.',
    requestKind: 'region',
    target: {
      url: 'https://example.com/reports/q1',
      title: 'Q1 report'
    },
    boundary: {
      kind: 'region',
      bounds: {
        x: 1180,
        y: 2600,
        width: 400,
        height: 900
      },
      pageBounds: {
        x: 0,
        y: 0,
        width: 1440,
        height: 3200
      },
      anchor: {
        x: 1180,
        y: 2600
      },
      focus: {
        x: 1580,
        y: 3500
      }
    },
    validation: {
      ok: false,
      outcome: 'invalid-boundary',
      reason: 'outside-active-page'
    }
  },
  {
    id: 'unsupported-browser-surface',
    label: 'Unsupported browser surface',
    description: 'Non-http browser surfaces stay unsupported for bounded selection capture.',
    requestKind: 'element',
    target: {
      url: 'chrome://settings',
      title: 'Chrome settings'
    },
    boundary: {
      kind: 'element',
      bounds: {
        x: 24,
        y: 96,
        width: 720,
        height: 480
      },
      pageBounds: {
        x: 0,
        y: 0,
        width: 1280,
        height: 1800
      },
      element: {
        tagName: 'main',
        role: 'main',
        label: 'Settings body'
      }
    },
    validation: {
      ok: false,
      outcome: 'unsupported-surface',
      reason: 'unsupported-page'
    }
  }
] as const satisfies readonly SelectionModeFixtureDefinition[];
