/**
 * Quaternion blending for poses, in pure JavaScript.
 *
 * ---------------------------------------------------------------------------
 * THE BUG THIS EXISTS FOR
 * ---------------------------------------------------------------------------
 * A clip was blended against the static pose with `lerpPoses`, which
 * interpolates the Euler NUMBERS. Those numbers come off the rig through
 * `unwrapPose`, whose entire job is to keep them continuous by choosing, every
 * frame, the spelling nearest last frame's — and those choices ACCUMULATE. By
 * the last frame of a clip a bone can be wound a full turn or more past where
 * it started, describing exactly the same rotation with a much larger number.
 *
 * Measured on the shipped clips, on the final frame:
 *
 *   VRMA_01  Show full body   hips.z         =  360.6 deg
 *   VRMA_05  Spin             leftLowerArm.z = -540.1 deg
 *   VRMA_06  Model pose       leftLowerArm.z = -359.8 deg
 *   VRMA_07  Squat            leftLowerArm.z = -721.5 deg
 *
 * Mid-clip that is free: at full clip weight the blend returns the clip pose
 * exactly, so the spelling never reaches the screen. It is the FADE-OUT that
 * shows it — over the last 600 ms the weight falls 1 to 0 and the lerp walks
 * `hips.z` from 360.6 deg down to about 0. Same rotation at both ends, a full
 * turn in between, and `hips` is the skeleton root, so the whole body
 * cartwheels sideways at the end of the clip. Every clip that ended wound up
 * did it, which is how it was reported: *at the end of every single animation*.
 *
 * ---------------------------------------------------------------------------
 * WHY QUATERNIONS FIX IT AND RE-SPELLING DOES NOT
 * ---------------------------------------------------------------------------
 * The obvious repair is to shift the clip's angles by whole turns until they
 * land near the pose being blended toward. That fixes `hips.z` and does not fix
 * the arms: their winding is not whole turns but the OTHER XYZ solution,
 * `(x+PI, PI-y, z+PI)`, which `unwrapEuler` deliberately selects when it is the
 * nearer spelling. No amount of turn-shifting removes a branch flip.
 *
 * A quaternion has no spelling. Two Euler triples describing one rotation
 * convert to the same quaternion (up to sign, which `slerp` resolves by taking
 * the short way round), so how the clip was written down stops mattering
 * entirely. That is the property being bought here, and it is why this replaces
 * the Euler path rather than patching it.
 *
 * `lerpPoses` keeps its Euler arithmetic and its justification — "these are
 * small rotations on a humanoid rig" is true of easing between two presets,
 * which is the job it still has. It was never true of clip blending, which is
 * where the large rotations live.
 *
 * ---------------------------------------------------------------------------
 * WHY THE MATH IS HERE RATHER THAN THREE'S
 * ---------------------------------------------------------------------------
 * Invariant 4: `lib/` imports neither React nor three.js, which is why the
 * suite runs in six seconds with no browser and no GPU. The conversions below
 * match three's `Quaternion.setFromEuler` and `Euler.setFromRotationMatrix` for
 * the default XYZ order, because the rig is read and written in that order and
 * a blend that disagreed with it would be a new bug in the same place.
 */

/** Euler XYZ (three's default order) to a unit quaternion. */
export function eulerToQuat({ x, y, z }) {
  const c1 = Math.cos(x / 2);
  const c2 = Math.cos(y / 2);
  const c3 = Math.cos(z / 2);
  const s1 = Math.sin(x / 2);
  const s2 = Math.sin(y / 2);
  const s3 = Math.sin(z / 2);

  return {
    x: s1 * c2 * c3 + c1 * s2 * s3,
    y: c1 * s2 * c3 - s1 * c2 * s3,
    z: c1 * c2 * s3 + s1 * s2 * c3,
    w: c1 * c2 * c3 - s1 * s2 * s3,
  };
}

/**
 * A unit quaternion back to Euler XYZ.
 *
 * Via the rotation matrix, the same route three takes. The gimbal branch —
 * `|m13|` at 1, where `y` is at +/-90 deg — is the case invariant 23 exists
 * for: there x and z are not separable, and the convention is to put all of it
 * on x. Rare, and stable, which is what matters for a value written to a bone.
 */
export function quatToEuler({ x, y, z, w }) {
  const x2 = x + x; const y2 = y + y; const z2 = z + z;
  const xx = x * x2; const xy = x * y2; const xz = x * z2;
  const yy = y * y2; const yz = y * z2; const zz = z * z2;
  const wx = w * x2; const wy = w * y2; const wz = w * z2;

  const m11 = 1 - (yy + zz);
  const m12 = xy - wz;
  const m13 = xz + wy;
  const m22 = 1 - (xx + zz);
  const m23 = yz - wx;
  const m32 = yz + wx;
  const m33 = 1 - (xx + yy);

  const ey = Math.asin(Math.max(-1, Math.min(1, m13)));

  if (Math.abs(m13) < 0.9999999) {
    return { x: Math.atan2(-m23, m33), y: ey, z: Math.atan2(-m12, m11) };
  }
  return { x: Math.atan2(m32, m22), y: ey, z: 0 };
}

/**
 * Spherical linear interpolation, always by the shorter arc.
 *
 * The sign flip is the whole point. A rotation and its negation are the same
 * orientation, so without it the interpolation is free to take the long way
 * round — which would reintroduce, in quaternion form, exactly the 360 degree
 * sweep this module exists to remove.
 *
 * Falls back to normalized linear interpolation when the two are nearly
 * parallel, where the sine denominator loses precision and the two answers are
 * indistinguishable anyway.
 */
export function slerp(a, b, t) {
  if (t <= 0) return a;
  if (t >= 1) return b;

  let dot = a.x * b.x + a.y * b.y + a.z * b.z + a.w * b.w;

  let bx = b.x; let by = b.y; let bz = b.z; let bw = b.w;
  if (dot < 0) {
    dot = -dot;
    bx = -bx; by = -by; bz = -bz; bw = -bw;
  }

  if (dot > 0.9995) {
    return normalize({
      x: a.x + (bx - a.x) * t,
      y: a.y + (by - a.y) * t,
      z: a.z + (bz - a.z) * t,
      w: a.w + (bw - a.w) * t,
    });
  }

  const theta = Math.acos(dot);
  const sinTheta = Math.sin(theta);
  const ka = Math.sin((1 - t) * theta) / sinTheta;
  const kb = Math.sin(t * theta) / sinTheta;

  return {
    x: a.x * ka + bx * kb,
    y: a.y * ka + by * kb,
    z: a.z * ka + bz * kb,
    w: a.w * ka + bw * kb,
  };
}

/** A unit quaternion, or identity if the input has collapsed to nothing. */
function normalize(q) {
  const len = Math.hypot(q.x, q.y, q.z, q.w);
  if (len === 0) return { x: 0, y: 0, z: 0, w: 1 };
  return { x: q.x / len, y: q.y / len, z: q.z / len, w: q.w / len };
}

const ZERO = { x: 0, y: 0, z: 0 };

/**
 * Blend two pose maps by the shortest rotation between them.
 *
 * The same contract as `lerpPoses` — bone maps in, bone map out, a bone present
 * on only one side interpolated against no rotation — and the same call shape,
 * so it is a drop-in wherever the rotations are large enough for the difference
 * to matter. Which, in this project, means blending an animation clip against a
 * static pose, and nothing else.
 *
 * @param {Record<string, {x:number,y:number,z:number}>} a  at t = 0
 * @param {Record<string, {x:number,y:number,z:number}>} b  at t = 1
 * @param {number} t clamped to 0..1
 */
export function blendPosesShortest(a = {}, b = {}, t) {
  const k = Math.max(0, Math.min(1, t));
  const out = {};

  for (const bone of new Set([...Object.keys(a), ...Object.keys(b)])) {
    const from = a[bone] ?? ZERO;
    const to = b[bone] ?? ZERO;

    // Short-circuiting the ends is not only speed: it guarantees the blend
    // reproduces its inputs EXACTLY at t=0 and t=1, so adopting this cannot
    // move a pose that nothing is blending. A quaternion round trip returns a
    // different spelling of the same rotation — harmless on the rig, and noise
    // in a test that is checking something else.
    if (k === 0) { out[bone] = from; continue; }
    if (k === 1) { out[bone] = to; continue; }

    out[bone] = quatToEuler(slerp(eulerToQuat(from), eulerToQuat(to), k));
  }

  return out;
}
