# BossBoard - Data Residency Consent Implementation Notes

## Registration/Onboarding Flow

BossBoard is a business management platform for NZ tradies and small service businesses. Data residency consent should be added to:

1. **Buyer/Seller Registration**
   - Account creation flow
   - Add data residency consent checkbox before profile completion

2. **Business Setup**
   - When registering business details
   - Require consent before enabling trading features

3. **Payment Setup**
   - Before connecting payment methods
   - Inform about data storage location for transaction records

### Implementation Steps
1. Add data residency consent checkbox to registration form
2. Make consent a required field before enabling trading
3. Add privacy notice link in account settings
4. Validate consent status in all transaction APIs
5. Store consent acceptance timestamp for compliance audits

### Backend Integration
- Add data_residency_consent_accepted field to users/business tables
- Add consent_accepted_at timestamp
- Require valid consent status for transaction operations
- Update terms of service to reference offshore data storage
- Add public endpoint: GET /privacy-policy

### Mobile/Web Considerations
- Ensure consent checkbox appears on all platforms
- Sync consent status across devices
- Store local consent acknowledgment

---
**Status:** Implementation needed
**Priority:** MEDIUM (active development)
**Compliance:** NZ Privacy Act 2020, Information Privacy Principle 12
**Date:** March 2026
