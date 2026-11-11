import { computeGlassesPose, widthFactorFor, yawFromMatrix } from "./pose";
import { EYE_OUTER_L, EYE_OUTER_R, NOSE_BRIDGE } from "./landmarks";
import type { Point } from "./landmarks";

const W = 1000;
const H = 1000;
const deg = (d: number) => (d * Math.PI) / 180;

// 478 points; only the eye corners and the nose bridge matter when yaw is passed in.
function face(left: Point, right: Point, bridge: Point): Point[] {
  const points: Point[] = Array.from({ length: 478 }, () => ({ x: 0.5, y: 0.5 }));
  points[EYE_OUTER_L] = left;
  points[EYE_OUTER_R] = right;
  points[NOSE_BRIDGE] = bridge;
  return points;
}

// Eyes level, 200 px apart; bridge at (500, 450) px.
const levelFace = face({ x: 0.4, y: 0.5 }, { x: 0.6, y: 0.5 }, { x: 0.5, y: 0.45 });

describe("computeGlassesPose", () => {
  it("anchors on landmark 168 plus the vertical offset, width = 1.55 × eye distance (AC2, AC3)", () => {
    const pose = computeGlassesPose(levelFace, W, H, { yaw: 0 });

    expect(pose.roll).toBeCloseTo(0, 10);
    expect(pose.cx).toBeCloseTo(500, 6);
    expect(pose.cy).toBeCloseTo(450 + 0.05 * 200, 6);
    expect(pose.width).toBeCloseTo(1.55 * 200, 6);
    expect(pose.visible).toBe(true);
  });

  it("follows the eye line for roll (AC4)", () => {
    const left = { x: 0.4, y: 0.5 };
    const right = { x: 0.4 + (200 * Math.cos(deg(20))) / W, y: 0.5 + (200 * Math.sin(deg(20))) / H };

    const pose = computeGlassesPose(face(left, right, { x: 0.5, y: 0.45 }), W, H, { yaw: 0 });

    expect(pose.roll).toBeCloseTo(deg(20), 6);
  });

  it("grows the width by 1/cos(yaw) and hides the glasses past 45° (AC4, AC5)", () => {
    const pose = computeGlassesPose(levelFace, W, H, { yaw: deg(60) });

    expect(pose.width).toBeCloseTo((1.55 * 200) / Math.cos(deg(60)), 6);
    expect(pose.visible).toBe(false);
  });

  it("clamps cos(yaw) at 0.35 for a strongly turned head (AC4)", () => {
    const pose = computeGlassesPose(levelFace, W, H, { yaw: deg(80) });

    expect(pose.width).toBeCloseTo((1.55 * 200) / 0.35, 6);
  });
});

describe("yawFromMatrix", () => {
  it("reads 0 from the identity matrix and the yaw from a column-major Y rotation", () => {
    const identity = [1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1];
    const a = deg(30);
    // Column-major rotation about Y: third column = (sin a, 0, cos a).
    const rotY = [Math.cos(a), 0, -Math.sin(a), 0, 0, 1, 0, 0, Math.sin(a), 0, Math.cos(a), 0, 0, 0, 0, 1];

    expect(yawFromMatrix(identity)).toBeCloseTo(0, 10);
    expect(yawFromMatrix(rotY)).toBeCloseTo(a, 10);
  });
});

describe("widthFactorFor (AC3)", () => {
  it("uses 1.55 without a frame width, frameWidthMm / 90 otherwise, clamped to [1.3, 1.8]", () => {
    expect(widthFactorFor(null)).toBe(1.55);
    expect(widthFactorFor(undefined)).toBe(1.55);
    expect(widthFactorFor(135)).toBeCloseTo(1.5, 10);
    expect(widthFactorFor(50)).toBe(1.3);
    expect(widthFactorFor(200)).toBe(1.8);
  });
});
