/**
 * IAP product catalog mapping (no network).
 */

jest.mock('../../config/index.js', () => ({
  config: {
    iap: {
      appleTradieProductId: 'nz.instilligent.bossboard.tradie.weekly',
      appleTeamProductId: 'nz.instilligent.bossboard.team.weekly',
      googleTradieProductId: 'bossboard_tradie_weekly',
      googleTeamProductId: 'bossboard_team_weekly',
      appleSharedSecret: '',
      googleServiceAccountJson: '',
      googlePackageName: 'nz.instilligent.bossboard',
    },
  },
}));

import { listIapProductCatalog } from '../../services/iap.js';

describe('listIapProductCatalog', () => {
  it('returns configured product ids', () => {
    const c = listIapProductCatalog();
    expect(c.ios.tradie).toContain('tradie');
    expect(c.android.team).toContain('team');
  });
});
