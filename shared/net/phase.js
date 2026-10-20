// Which match rules (frozen / allowed to fight) apply to one of our inputs.
//
// The freeze → live switch is decided by INPUT NUMBER, not by arrival time: shortly before the freeze
// ends, the server tells each client `liveSeq`, the first of its inputs that runs unfrozen. Both
// sides then apply `frozen = seq < liveSeq`, so prediction can't disagree with the server at a
// round start, whatever the latency or jitter.
//
// Before liveSeq is known (and for the live → round-end switch) we estimate: the server ends phases
// on exact ticks (phaseEnd) and runs about one input per tick, so input `seq` runs at roughly tick
// seq + (snapshot tick - acknowledged seq).

/** Server rule: how many ticks before the freeze ends liveSeq is chosen, and how early it may apply. */
export const LIVE_SEQ_LEAD = 45;
export const LIVE_SEQ_EARLIEST = 10;

/**
 * @param phase     current phase from the latest snapshot
 * @param phaseEnd  server tick on which that phase ends (0 = unknown)
 * @param offsets   recent samples of (snapshot tick - acknowledged input seq)
 * @param seq       the input to predict for
 * @param liveSeq   first unfrozen input this round, if the server has announced it
 * @returns {{frozen: boolean, canFight: boolean}}
 */
export function predictPhaseOpts(phase, phaseEnd, offsets, seq, liveSeq = null) {
  let ph = phase;
  if (offsets.length && phaseEnd) {
    const sorted = offsets.slice().sort((a, b) => a - b);
    const tick = seq + sorted[sorted.length >> 1];
    if (tick > phaseEnd) {
      if (ph === 'freeze') ph = 'live';
      else if (ph === 'live') ph = 'roundEnd';
    }
  }
  if (liveSeq != null && (phase === 'freeze' || phase === 'live')) {
    const frozen = seq < liveSeq;
    return { frozen, canFight: !frozen && ph !== 'roundEnd' };
  }
  return { frozen: ph === 'freeze', canFight: ph === 'live' };
}
