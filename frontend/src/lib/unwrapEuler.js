/**
 * Keep a stream of Euler angles continuous from frame to frame.
 *
 * ---------------------------------------------------------------------------
 * THE BUG THIS EXISTS FOR
 * ---------------------------------------------------------------------------
 * An AnimationMixer writes QUATERNIONS to the bones. The compositor works in
 * EULER angles. So every frame a clip is playing, VrmAvatar reads
 * `node.rotation` back — and that conversion is not continuous.
 *
 * A quaternion has many Euler spellings. `setFromQuaternion` picks one, and
 * which one it picks changes abruptly as the rotation moves: most obviously by
 * a full turn on an axis, and worst of all near gimbal, where `y` approaches
 * +/-PI/2 and the x and z solutions swap branches. Measured on the shipped
 * clips, the read-back jumps by up to 2PI in a single frame while the actual
 * motion never exceeds about 20 degrees a frame.
 *
 * Those spellings describe the SAME rotation, so writing one straight back
 * would be harmless. The compositor does not write it straight back. It adds
 * the state overlay, the weight shift, breathing and sway on top — and a delta
 * added in one Euler branch does not mean what it means in another. The result
 * was a single-frame jerk, always at the same moment in a given clip, because
 * it is a property of the path the clip takes rather than of anything timed.
 *
 * The fix is to choose, every frame, the spelling NEAREST the one used last
 * frame. Same rotation, no jump, and the layers above keep adding to something
 * that moves smoothly.
 *
 * TWO KINDS OF JUMP, and both are handled here, because fixing only the first
 * left most of the problem in place — measured, not assumed:
 *
 *   whole turns   an axis gains or loses 2PI. Fixed by rounding to the nearest
 *                 turn. On the shipped clips this alone took the worst frame
 *                 from 507 degrees down to 115.
 *   branch swaps  near gimbal, where `y` approaches +/-PI/2, XYZ has a second
 *                 exact spelling: (x+PI, PI-y, z+PI). three's converter switches
 *                 between the two as the rotation moves through. Verified
 *                 numerically to be the same rotation to within 3.4e-6 degrees.
 *
 * Both candidates are generated and the nearer one wins, so the output follows
 * whichever spelling the previous frame was already using. See
 * docs/03-frame-loop.md.
 *
 * Pure by mandate — invariant 4.
 */

const TAU = Math.PI * 2;

/**
 * The spelling of `next` closest to `prev`, differing only by whole turns.
 *
 * @param {number} prev last frame's angle, in radians
 * @param {number} next this frame's angle, in radians
 * @returns {number} `next` plus whatever multiple of 2PI lands nearest `prev`
 */
export function unwrapAngle(prev, next) {
  if (!Number.isFinite(prev) || !Number.isFinite(next)) return next;
  // One rounding rather than a while loop: a NaN or a wild value would spin a
  // loop for a very long time, and this is running 55 bones a frame.
  return next + TAU * Math.round((prev - next) / TAU);
}

/** Squared distance between two Euler triples, for choosing between spellings. */
function spread(a, b) {
  const dx = a.x - b.x;
  const dy = a.y - b.y;
  const dz = a.z - b.z;
  return dx * dx + dy * dy + dz * dz;
}

/**
 * The spelling of `rot` nearest `prev`, considering both XYZ solutions.
 *
 * @param {{x:number,y:number,z:number}} prev last frame's angles
 * @param {{x:number,y:number,z:number}} rot this frame's, as read from the rig
 */
export function nearestSpelling(prev, rot) {
  if (!prev) return rot;

  const direct = {
    x: unwrapAngle(prev.x, rot.x),
    y: unwrapAngle(prev.y, rot.y),
    z: unwrapAngle(prev.z, rot.z),
  };

  // The other exact solution for XYZ order. Same rotation, different numbers —
  // which is the whole problem, since the layers above add to the numbers.
  const flipped = {
    x: unwrapAngle(prev.x, rot.x + Math.PI),
    y: unwrapAngle(prev.y, Math.PI - rot.y),
    z: unwrapAngle(prev.z, rot.z + Math.PI),
  };

  return spread(prev, direct) <= spread(prev, flipped) ? direct : flipped;
}

/**
 * Unwrap a whole pose against the previous frame's.
 *
 * Bones absent from `prev` pass through untouched — there is nothing to be
 * continuous with on a clip's first frame, and inventing a reference there
 * would be worse than starting wherever the clip starts.
 *
 * Returns a new object; neither argument is mutated.
 *
 * @param {Record<string, {x:number,y:number,z:number}>|null} prev
 * @param {Record<string, {x:number,y:number,z:number}>} pose
 */
export function unwrapPose(prev, pose) {
  if (!prev) return pose;
  const out = {};
  for (const [bone, rot] of Object.entries(pose)) {
    const was = prev[bone];
    out[bone] = was ? nearestSpelling(was, rot) : rot;
  }
  return out;
}
