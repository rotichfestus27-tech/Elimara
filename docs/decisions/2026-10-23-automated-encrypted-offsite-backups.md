# Architecture Decision Record: Automated Encrypted Offsite Backups

- **Status**: Approved
- **Date**: 2026-10-23
- **Owners**: Developer A (Backend Lead / DBA), Developer B (Platform / Frontend Lead)
- **Relevant Decisions**: D-03 (Technology Stack), D-10 (People, Privacy, and Documents), D-15 (Migrations and Runtime), D-16 (Integrations and Operations)

---

## 1. Context & Threat Model

While Neon Serverless PostgreSQL provides continuous WAL replication and Point-in-Time Recovery (PITR) within the primary cloud infrastructure, relying exclusively on a single cloud vendor presents critical single-point-of-failure risks:
1. **Cloud Account Lockout / Provider Outage**: Account suspension, billing disputes, or regional cloud outages could render primary and replica storage inaccessible.
2. **Accidental / Malicious Project Deletion**: An administrative credential leak or insider incident could result in deletion of the Neon project and its associated WAL logs.
3. **Data Protection Compliance (Kenya DPA 2019 / GDPR)**: Multi-tenant student identity, fee payment, and child guardianship records require cryptographically sound data retention, encryption at rest, and geographic disaster recovery guarantees.

To achieve defense-in-depth, Elimara requires an automated offsite backup pipeline storing encrypted logical dumps in an independent, S3-compatible object storage destination (Cloudflare R2 or Amazon S3).

---

## 2. Threat Analysis & Encryption Strategy

| Threat Vector | Mitigation Strategy |
|---|---|
| **Eavesdropping on Network Transit** | Enforce TLS 1.3 for database connection (`sslmode=require`) and HTTPS for S3 endpoints. |
| **Object Storage Provider Breach** | **Client-Side AES-256-GCM Encryption**: The backup worker encrypts the compressed archive *before* it leaves memory. Cloud storage staff or attackers compromising the S3 bucket see only ciphertext. |
| **Tampering / Bit-Rot / Data Corruption** | GCM 128-bit authentication tag + SHA-256 checksum recorded in S3 metadata (`x-amz-meta-sha256`) and signed manifest. Any byte modification causes decryption to fail immediately. |
| **Public Exposure of Backup Artifacts** | Bucket configured with S3 Public Access Block (`BlockPublicAcls`, `IgnorePublicAcls`, `BlockPublicPolicy`, `RestrictPublicBuckets`). No pre-signed public URLs. |
| **Excessive Cloud Storage Privileges** | Dedicated IAM user/token scoped strictly to `s3:PutObject`, `s3:GetObject`, `s3:ListBucket`, `s3:AbortMultipartUpload` on the specific backup bucket prefix. No bucket deletion or policy modification rights. |
| **Split-Brain / Overlapping Jobs** | Atomic job concurrency locking using execution mutex and non-overlapping scheduling. |

---

## 3. Decision

1. **Storage Destination**: Adopt S3-compatible object storage. **Cloudflare R2** is designated as the primary offsite target (zero egress fees, automatic encryption at rest, S3 API compatibility), with **Amazon S3** as the supported enterprise alternative.
2. **Format & Compression**: Logical dumps compressed with `gzip` (level 9) to minimize storage footprint and egress overhead.
3. **Client-Side Encryption Standard**:
   - Algorithm: **AES-256-GCM** with unique 96-bit (12-byte) or 128-bit (16-byte) random Initialization Vector (IV) per backup.
   - Key: 256-bit cryptographic key supplied via runtime secret `BACKUP_ENCRYPTION_KEY`.
   - Structure: Payload format contains `[16-byte IV] + [Ciphertext] + [16-byte Auth Tag]`.
4. **Naming Convention & Manifest**:
   - File: `backups/YYYY/MM/elimara-backup-YYYY-MM-DDTHH-mm-ssZ.dump.gz.enc`
   - Manifest: `backups/YYYY/MM/elimara-backup-YYYY-MM-DDTHH-mm-ssZ.manifest.json`
5. **Retention Lifecycle**:
   - **Daily Backups**: Retained for 30 days.
   - **Weekly Backups (Sunday)**: Retained for 90 days.
   - **Monthly Backups (1st of month)**: Retained for 365 days (or archived to Glacier/Cold storage for 7-year statutory financial compliance).
6. **Integrity & Restore Verification Gate**:
   - Dedicated automated verification commands (`db:backup:create`, `db:backup:verify`, `db:backup:restore`) provided in `@elimara/database`.
   - Restore verification executes non-destructively against an isolated disposable database.

---

## 4. Consequences & Operational Impact

- **Storage Costs**: An encrypted, compressed Elimara database snapshot of typical initial size (5–50 MB compressed) retained across the tiered schedule incurs < $1.00/month on Cloudflare R2 / AWS S3.
- **RPO / RTO**: Guarantees maximum **RPO $\le$ 24 hours** for catastrophic cloud disaster recovery, complementing Neon's continuous WAL PITR (RPO < 5 minutes) for localized operational recovery.
- **Secret Management**: All storage and encryption credentials reside exclusively in deployment platform secret managers (AWS Secrets Manager, Cloudflare Secrets, or GitHub Actions Secrets). No secrets exist in source code or committed configs.
