# Security Specification - Fungus Adventure

## Data Invariants
1. A user is unique by email.
2. `score_historia` can only be set once (no overrides).
3. `score_infinito` can only be incremented.
4. Users cannot change their identity (name, grade) after registration.
5. All IDs must be valid emails.

## The "Dirty Dozen" Payloads (Red Team Tests)
1. **Identity Spoofing**: Attempt to create a user where document ID != `data.email`. (REJECTED)
2. **Score Override (Story)**: Attempt to update `score_historia` when it already exists. (REJECTED)
3. **Score Sabotage (Infinite)**: Attempt to decrease `score_infinito`. (REJECTED)
4. **Identity Hijack**: Attempt to change `fullName` or `grade` in an update. (REJECTED)
5. **Timestamp Forge**: Attempt to set `createdAt` to a future time during creation. (REJECTED)
6. **Shadow Fields**: Attempt to add unauthorized fields like `isAdmin`. (REJECTED)
7. **Negative Scores**: Attempt to set scores to negative values. (REJECTED)
8. **Resource Exhaustion**: Use extremely long strings for `fullName` or `grade`. (REJECTED via .size() checks)
9. **No Identity Creation**: Attempt to create a user without `fullName` or `grade`. (REJECTED)
10. **Partial Update Gap**: Attempt to update `score_infinito` while also changing `fullName`. (REJECTED via affectedKeys().hasOnly())
11. **ID Poisoning**: Attempt to use invalid characters in the email ID. (REJECTED via regex)
12. **Anonymity Bridge**: Attempting reads/writes without following the email-as-ID schema. (REJECTED)

## Conflict Report
- Identity Spoofing: Protected by `isValidId(email)` and `email == incoming().email`.
- State Shortcutting: Protected by `!existing().keys().hasAny(['score_historia'])`.
- Resource Poisoning: Protected by `.size()` and `.matches()` checks.
