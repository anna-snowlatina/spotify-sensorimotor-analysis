import { useMemo, useState } from 'react';
import { WINDOWS, type TopData, type Window } from '../data/topItems';
import { scoreTracks, windowProfile, windowCoverage, type Coverage, type Norms } from '../sensory/score';
import { zScore } from '../sensory/stats';
import { SensoryRadar } from './SensoryRadar';
import { CoverageNote } from './CoverageNote';

export function SensoryPanel({ data, norms }: { data: TopData; norms: Norms }) {
  const [rankWeighted, setRankWeighted] = useState(false);

  const computed = useMemo(() => {
    const zProfiles: Record<Window, number[] | null> = {} as Record<Window, number[] | null>;
    const coverage: Record<Window, Coverage> = {} as Record<Window, Coverage>;
    for (const w of WINDOWS) {
      const scores = scoreTracks(data[w].tracks, norms);
      const profile = windowProfile(scores, norms.dims.length, rankWeighted);
      zProfiles[w] = profile ? zScore(profile, norms.mean, norms.sd) : null;
      coverage[w] = windowCoverage(scores);
    }
    return { zProfiles, coverage };
  }, [norms, data, rankWeighted]);

  return (
    <div className="card">
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 8 }}>
        <h2 style={{ margin: 0 }}>Sensory space</h2>
        <label style={{ fontSize: 13 }}>
          <input
            type="checkbox"
            checked={rankWeighted}
            onChange={(e) => setRankWeighted(e.target.checked)}
          />{' '}
          Weight by rank (1/√rank)
        </label>
      </div>
      <CoverageNote coverage={computed.coverage} />
      <SensoryRadar dims={norms.dims} profiles={computed.zProfiles} />
    </div>
  );
}
