# MongoDB Backup Strategy & Procedure

## Overview
This document outlines the backup and disaster recovery procedures for Asta Mart's MongoDB database.

## Backup Options

### FOR MONGODB ATLAS (Cloud MongoDB - Recommended)

#### Automatic Backups
- MongoDB Atlas provides automatic daily backups by default
- Backups are retained for 7 days in Free tier, 35 days in Shared/Dedicated tiers
- Snapshots are stored in AWS S3 buckets owned by MongoDB

#### Enable Continuous Backup
1. Log in to MongoDB Atlas Dashboard
2. Go to Cluster → Backup
3. Enable "Continuous Backup" (available on M10+ clusters)
4. Set retention policy to minimum 30 days
5. Test restore procedure monthly

#### Manual Backup via mongodump
```bash
# Export entire database
mongodump --uri="mongodb+srv://username:password@cluster.mongodb.net/dbname" \
  --out /backups/asta-mart

# For specific collection
mongodump --uri="mongodb+srv://username:password@cluster.mongodb.net/dbname" \
  --collection listings \
  --out /backups/asta-mart-listings
```

### FOR SELF-HOSTED MONGODB

#### Daily Backup Script
Create `backend/backup.sh`:
```bash
#!/bin/bash
set -e

BACKUP_DIR="/backups/mongo"
TIMESTAMP=$(date +%Y-%m-%d_%H-%M-%S)
MONGODB_URI="${MONGODB_URI}"  # Set from environment
RETENTION_DAYS=30

echo "[Backup] Starting MongoDB backup at $TIMESTAMP"

# Create backup directory
mkdir -p "$BACKUP_DIR"

# Run mongodump
mongodump --uri="$MONGODB_URI" --out="$BACKUP_DIR/$TIMESTAMP"

if [ $? -eq 0 ]; then
    echo "[Backup] ✅ Backup completed: $BACKUP_DIR/$TIMESTAMP"
else
    echo "[Backup] ❌ Backup failed"
    exit 1
fi

# Cleanup old backups (keep only last 30 days)
echo "[Backup] Cleaning up backups older than $RETENTION_DAYS days..."
find "$BACKUP_DIR" -maxdepth 1 -type d -mtime +$RETENTION_DAYS -exec rm -rf {} \;

echo "[Backup] ✅ Cleanup completed"
```

#### Schedule with Cron
```bash
# Edit crontab
crontab -e

# Add this line to run backup every day at 2:00 AM
0 2 * * * /home/ubuntu/asta-mart/backend/backup.sh >> /var/log/asta-mart-backup.log 2>&1
```

#### Monitor Backup Success
```bash
# Check recent backups
ls -lah /backups/mongo | head -10

# Check backup log
tail -50 /var/log/asta-mart-backup.log
```

## Restore Procedures

### Restore from Atlas Backup
1. MongoDB Atlas Dashboard → Cluster → Backup
2. Click "Restore" on desired backup snapshot
3. Choose: "Restore to new Atlas cluster" or "Restore to a connection string"
4. Verify restored data integrity before committing

### Restore from mongodump
```bash
# Full database restore
mongorestore --uri="mongodb+srv://username:password@cluster.mongodb.net/dbname" \
  --dir=/backups/asta-mart/desired_timestamp

# Specific collection restore
mongorestore --uri="mongodb+srv://username:password@cluster.mongodb.net/dbname" \
  --collection listings \
  --dir=/backups/asta-mart-listings/desired_timestamp
```

## Testing & Validation

### Monthly Restore Test Checklist
- [ ] Select backup from 30 days ago
- [ ] Restore to staging/test environment
- [ ] Verify data integrity (row counts, key documents)
- [ ] Test application against restored dataset
- [ ] Confirm no data corruption
- [ ] Document test results with timestamp

### Data Integrity Checks
```bash
# Count documents in key collections
mongosh "mongodb+srv://username:password@cluster.mongodb.net/dbname" << EOF
db.listings.countDocuments()
db.users.countDocuments()
db.orders.countDocuments()
db.transactions.countDocuments()
EOF
```

## Disaster Recovery Plan

### Recovery Time Objective (RTO)
- **Critical Data Outage**: 4 hours
- **Partial Data Loss**: 24 hours

### Recovery Point Objective (RPO)
- **Atlas with Continuous Backup**: Last transaction (near-zero RPO)
- **Daily mongodump**: Last 24 hours (up to 24 hours of potential loss)

### Recovery Steps
1. **Assess damage**: Determine extent of data loss/corruption
2. **Identify restore point**: Choose safest backup before incident
3. **Initialize restore**: Start restore process (5-30 minutes depending on size)
4. **Validate data**: Run integrity checks on restored data  
5. **Update application**: Update connection string if moving to new cluster
6. **Monitor performance**: Watch metrics during recovery
7. **Notify stakeholders**: Update users on recovery progress
8. **Post-mortem**: Document incident and lessons learned

## Backup Storage & Security

### Encryption
- **In Transit**: TLS/SSL (MongoDB Atlas requires TLS)
- **At Rest**: AES-256 (MongoDB Atlas default)
- **Backup Files**: Should be encrypted before external storage

### Secure Backup Storage
```bash
# Compress and encrypt backups before transferring
tar czf - /backups/mongo | gpg --encrypt --recipient backup@asta-mart.in > backup.tar.gz.gpg

# Upload to S3
aws s3 cp backup.tar.gz.gpg s3://asta-mart-backups/mongodb/
```

### S3 Bucket Policy (Example)
```json
{
  "Version": "2012-10-17",
  "Statement": [
    {
      "Effect": "Allow",
      "Principal": { "AWS": "arn:aws:iam::ACCOUNT_ID:user/backup-robot" },
      "Action": ["s3:PutObject", "s3:GetObject"],
      "Resource": "arn:aws:s3:::asta-mart-backups/mongodb/*"
    }
  ]
}
```

## Automation Recommendations

### Automated Backup Verification
Use a Lambda function or CronJob to:
1. Verify backup file exists and size is reasonable
2. Check backup timestamp (should be within last 24 hours)
3. Alert if backup failed

### Alerting
Configure alerts via CloudWatch/DataDog/PagerDuty for:
- Backup job failure
- Missing backup for >24 hours
- Backup file size anomaly (too small/large)
- Restore job failure

## Compliance & Auditing

- **Backup retention policy**: Minimum 30 days
- **Audit logs**: Log all backup/restore operations
- **Access control**: Only ops team can trigger restores
- **Encryption keys**: Securely manage and rotate encryption keys
- **Documentation**: Maintain this document and update monthly

---

**Last Updated**: April 9, 2026
**Last Tested**: [Date of last restore test]
**Next Test Scheduled**: [Date]
