/*
  Two experiences over the same choreography (keys 1 / 2):

  1  the original: everything centred, copy on the left, one scroll unit = 100vh.
  2  split: the humanoid and all the animation live in a sticky LEFT column, a RIGHT column of text
     scrolls past. Every text block is pinned to a moment of the animation (it reaches the middle of the
     screen exactly when the left column shows its frame), and the timeline is stretched per segment
     in between, so text and animation never drift apart, forwards or backwards.

  Positions are reference px in the 1506 x 845 frame. Variant 2 places things relative to the left
  column: x is written as calc(LEFT% + (x - LEFT_X)px) so the column scales with the viewport width.
*/

export const V2_LEFT = { pct: 26.76, x: 403 }        // visual centre of the left column
export const V2_RAIL_PCT = 57.13                     // the divider / right column start

// the lab reading on the marker card: high and red at Baseline, settled and green at Become
const APOB = { label: 'ApoB', from: { num: 155, fill: 0.74, mark: 0.68 }, to: { num: 70, fill: 0.333, mark: 0.135 }, unitFrom: 'mg/dL', unitTo: 'pg/mL' }

export const VARIANTS = {
  1: {
    id: 1,
    hero: { cx: 760.5, cy: 435.25, w: 439 },
    phone: { left: 599.5, top: 90.5, k: 1 },
    reco: { r: 1 },
    cards: null,                                  // CSS defaults
    scale: { blood: 1, apob: 1, prod: 1, glass: 1 },
    apob: APOB,
    apobBecome: { scale: 0.867, x: -18, y: -15.5 },
    bg: { start: 'blue', baseline: 'pink', blueprint: null, build: 'sky', become: 'become' },
    dustX: 0,
    frames: [0.25, 1.95, 3.6, 4.78, 5.72, 7.12, 8.85, 10.9, 12.65],
  },
  2: {
    id: 2,
    // measured on the split frames (Workflow/b): figure 0.90, phone 0.978, cards 0.83-0.91, glass 0.754
    hero: { cx: 405.5, cy: 422.3, w: 439 * 0.9 },
    phone: { left: 248.2, top: 87.2, k: 0.978 },
    reco: { r: 0.783 },                           // recommendation slot = V1 slot x 0.783, in a carousel
    cards: {
      blood: { left: 120.35, top: 259.1 },
      apob: { left: 420.6, top: 384.7 },
      prog: { left: 116, top: 310.1 },
      testo: { left: 502.5, top: 152.6 },        // product cards scale from their top-left corner
      peptides: { left: 502.5, top: 495.6 },
      glass: { left: 401 - 222.9, top: 417.5 - 319.65 },
    },
    panel: { cx: 401, cy: 417.5, w: 678, h: 650 },
    scale: { blood: 0.847, apob: 0.826, prod: 0.908, glass: 0.754 },
    apob: APOB,                                   // the same ApoB reading as experience 1
    apobBecome: { scale: 0.826, x: 0, y: 0 },
    bg: { start: 'v2start', baseline: 'v2pink', blueprint: 'v2phone', build: 'v2build', become: 'v2become' },
    dustX: V2_LEFT.x - 753,
    // Right-column blocks. Each one scrolls in, HOLDS at the middle of the screen while its step plays
    // (timeline span \`hold\`, over \`H\` x 100vh of scroll), then scrolls on as the next one arrives
    // (\`gap\` x 100vh, during which the timeline moves between the two holds).
    rail: {
      blocks: [
        { hold: [0, 1.35], H: 0.9 },       // 01 Baseline: grey -> red, the ApoB card
        { hold: [1.75, 2.2], H: 0.5 },     //    + the blood sample
        { hold: [3.0, 5.7], H: 1.6 },      // 02 Blueprint: into the phone, the UI scroll, the video
        { hold: [6.1, 7.1], H: 0.8 },      //    + the products
        { hold: [7.7, 8.9], H: 1.0 },      // 03 Build: the card into the recommendations
        { hold: [9.6, 12.95], H: 2.2 },    // 04 Become: results settle, the photo, the body in the card
      ],
      gap: 0.9,
      tail: 0.4,
      centre: 0.44,                        // blocks are centred at 44% of the viewport height
    },
    // the split frames keep one size at any window height: scale by width, height only as a limit
    unitH: 760,
    frames: [0.2, 1.3, 1.95, 5.6, 7.0, 8.8, 12.5],
  },
}

// ?v=1 / ?v=2 in the URL, else the exported file's config, else experience 1
export function readVariant() {
  const q = new URLSearchParams(location.search).get('v')
  const v = q === '2' ? 2 : q === '1' ? 1 : window.__HONE_CONFIG?.v === 2 ? 2 : 1
  return VARIANTS[v]
}
