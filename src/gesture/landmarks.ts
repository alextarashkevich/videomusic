/** MediaPipe's canonical hand landmark order. */
export const LANDMARK = {
  WRIST: 0,

  THUMB_CMC: 1,
  THUMB_MCP: 2,
  THUMB_IP: 3,
  THUMB_TIP: 4,

  INDEX_MCP: 5,
  INDEX_PIP: 6,
  INDEX_DIP: 7,
  INDEX_TIP: 8,

  MIDDLE_MCP: 9,
  MIDDLE_PIP: 10,
  MIDDLE_DIP: 11,
  MIDDLE_TIP: 12,

  RING_MCP: 13,
  RING_PIP: 14,
  RING_DIP: 15,
  RING_TIP: 16,

  PINKY_MCP: 17,
  PINKY_PIP: 18,
  PINKY_DIP: 19,
  PINKY_TIP: 20,
} as const

/** Bit positions within a FingerMask. Thumb is the high bit, so masks read left to right
 *  as [thumb, index, middle, ring, pinky] — matching how the gesture tables are written. */
export const FINGER_BIT = {
  THUMB: 0b10000,
  INDEX: 0b01000,
  MIDDLE: 0b00100,
  RING: 0b00010,
  PINKY: 0b00001,
} as const

/** The four fingers that fold along the same axis and can share one test. The thumb
 *  needs its own, which is why it is absent here. */
export const HINGED_FINGERS = [
  { name: 'index', bit: FINGER_BIT.INDEX, mcp: LANDMARK.INDEX_MCP, tip: LANDMARK.INDEX_TIP },
  { name: 'middle', bit: FINGER_BIT.MIDDLE, mcp: LANDMARK.MIDDLE_MCP, tip: LANDMARK.MIDDLE_TIP },
  { name: 'ring', bit: FINGER_BIT.RING, mcp: LANDMARK.RING_MCP, tip: LANDMARK.RING_TIP },
  { name: 'pinky', bit: FINGER_BIT.PINKY, mcp: LANDMARK.PINKY_MCP, tip: LANDMARK.PINKY_TIP },
] as const

/** Pairs of landmark indices to draw as bones in the overlay. */
export const HAND_BONES: readonly (readonly [number, number])[] = [
  // palm
  [0, 1], [0, 5], [0, 17], [5, 9], [9, 13], [13, 17],
  // thumb
  [1, 2], [2, 3], [3, 4],
  // index
  [5, 6], [6, 7], [7, 8],
  // middle
  [9, 10], [10, 11], [11, 12],
  // ring
  [13, 14], [14, 15], [15, 16],
  // pinky
  [17, 18], [18, 19], [19, 20],
]
