// Domain enums shared across the API and web app.
// See docs/04-domain-model.md.

/** How a ballot's preferences are collected. MVP supports STRICT_RANKING only. */
export enum BallotFormat {
  STRICT_RANKING = 'STRICT_RANKING',
  RANKING_WITH_TIES = 'RANKING_WITH_TIES',
  PARTIAL_RANKING = 'PARTIAL_RANKING',
  PAIRWISE = 'PAIRWISE',
}

/** How results are calculated from ballots. MVP supports BORDA only. */
export enum CountingMethod {
  BORDA = 'BORDA',
  IRV = 'IRV',
  CONDORCET = 'CONDORCET',
  SCHULZE = 'SCHULZE',
  RANKED_PAIRS = 'RANKED_PAIRS',
}
