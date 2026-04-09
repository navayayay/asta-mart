# Asta Mart - Production Deployment Guide

**Last Updated:** April 9, 2026  
**Version:** 1.0  
**Status:** Ready for Production Deployment

---

## Pre-Deployment Checklist

### Security Verification (15 minutes)
- [ ] **Secrets Rotated:** New JWT_SECRET and ADMIN_SECRET (32+ chars) generated
- [ ] **Environment Variables:** All set in hosting provider (NOT in .env file)
- [ ] **.env in .gitignore:** Verify file is ignored from version control
- [ ] **HTTPS Certificate:** Valid SSL certificate installed
- [ ] **CORS Configured:** Backend CORS includes only frontend domain
- [ ] **Rate Limiting:** Verified active on all auth endpoints
- [ ] **CSRF Protection:** All POST/PUT/PATCH/DELETE routes protected
- [ ] **Console Logs:** NODE_ENV guards verified in all files

### Database Preparation (10 minutes)
- [ ] **MongoDB Connection:** Tested in production environment
- [ ] **Database Backup:** Full backup created before deployment
- [ ] **Connection Pooling:** MongoDB connection pool size set (default: 10)
- [ ] **Indexes:** MongoDB indexes created for common queries
  ```bash
  # Run in MongoDB shell:
  db.listings.createIndex({createdAt: -1})
  db.listings.createIndex({status: 1})
  db.users.createIndex({email: 1})
  db.orders.createIndex({createdAt: -1})
  ```

### Email Service (5 minutes)
- [ ] **Gmail/Email:** Production email address configured
- [ ] **App Password:** Generated and stored (not regular password)
- [ ] **Test Email:** Send test email to confirm working

### Domain & DNS (5 minutes)
- [ ] **DNS Records:** A record points to server IP
- [ ] **Subdomain:** api.asta-mart.in pointing to backend
- [ ] **Root Domain:** asta-mart.in pointing to frontend
- [ ] **DNS Propagation:** Allow 24-48 hours if just changed

### External Services (10 minutes)
- [ ] **MongoDB Atlas:** Cluster configured with appropriate tier
- [ ] **Email Provider:** Setup and credentials verified
- [ ] **File Storage (Optional):** S3 or similar configured if needed for images
- [ ] **Monitoring (Optional):** Sentry account created (recommended)

---

## Deployment Steps

### Step 1: Final Testing Locally (30 minutes)
```bash
# Test in local development environment
cd d:\site

# Install dependencies
npm install

# Start backend
cd backend
npm install
NODE_ENV=production node server.js

# In another terminal, start frontend
cd frontend
npm install
npm start

# Test critical flows:
# - User signup
# - Create listing
# - Reveal seller contact
# - Admin login
```

### Step 2: Deploy Backend (15 minutes)

```bash
# Option A: Deploy to Cloud (Heroku, Railway, etc.)
git push heroku main

# Option B: Deploy to VPS/Server
ssh user@api.asta-mart.in
cd /var/www/asta-mart
git pull origin main
npm install
npm start  # Should be managed by PM2 or similar

# Option C: Docker Deployment
docker build -t asta-mart-backend .
docker run -d -p 5000:5000 \
  -e NODE_ENV=production \
  -e MONGODB_URI=$PROD_MONGODB_URI \
  -e JWT_SECRET=$PROD_JWT_SECRET \
  -e ADMIN_SECRET=$PROD_ADMIN_SECRET \
  -e EMAIL_USER=$PROD_EMAIL \
  -e EMAIL_PASS=$PROD_EMAIL_PASS \
  asta-mart-backend
```

**Verify Backend Running:**
```bash
# Check health endpoint
curl https://api.asta-mart.in/health

# Expected response:
# {"status":"ok","timestamp":"2026-04-09T10:30:00Z"}
```

### Step 3: Deploy Frontend (10 minutes)

```bash
# Build production bundle
cd frontend
npm run build  # If build script exists
# OR
npm install && npm start

# Option: Deploy to Netlify/Vercel
# - Push to GitHub
# - Connect repository to Netlify/Vercel
# - Automatic deployment on push to main
```

### Step 4: Verify Integration (15 minutes)

```bash
# Test API connectivity
curl https://api.asta-mart.in/api/listings

# Test CSRF protection
curl -X POST https://api.asta-mart.in/api/listings \
  -H "Content-Type: application/json" \
  -d '{"test": "data"}' 
# Should return 403 Forbidden (CSRF token missing)

# Test HTTPS redirect
curl -I http://api.asta-mart.in
# Should redirect to https

# Check security headers
curl -I https://api.asta-mart.in | grep -E 'X-Frame-Options|X-Content-Type-Options|Strict-Transport-Security'
```

### Step 5: Smoke Testing (20 minutes)

**Test complete user flow:**
1. Open https://asta-mart.in in browser
2. Sign up with test email
3. Verify OTP received in email
4. Create listing with test Valorant account
5. Navigate to dashboard
6. Reveal seller contact
7. Access admin panel (https://asta-mart.in/admin.html)

**Monitor logs during tests:**
```bash
# Monitor backend logs
tail -f /var/log/asta-mart/backend.log

# Watch for:
# ✅ "Connected to MongoDB"
# ✅ "[EMAIL] Email service ready"
# ✅ No error messages
# ❌ Do NOT see development debug logs
```

---

## Post-Deployment Monitoring (First 24 Hours)

### Hour 1: Continuous Monitoring
- [ ] Watch error logs constantly
- [ ] Monitor CPU/Memory usage
- [ ] Check database connection
- [ ] Monitor rate limiting (no false positives)
- [ ] Check email sending

**Command to monitor:**
```bash
# Real-time error log monitoring
tail -f /var/log/asta-mart/backend.log | grep -E 'ERROR|❌'
```

### Hour 2-24: Background Monitoring
- [ ] Run automated health checks every 5 minutes
- [ ] Alert if status != 200
- [ ] Monitor error rate (should be < 1%)
- [ ] Check user signups are working
- [ ] Verify email deliveries

**Health Check Script:**
```bash
#!/bin/bash
# save as check-health.sh
while true; do
  STATUS=$(curl -s -o /dev/null -w "%{http_code}" https://api.asta-mart.in/health)
  TIMESTAMP=$(date '+%Y-%m-%d %H:%M:%S')
  
  if [ "$STATUS" = "200" ]; then
    echo "[$TIMESTAMP] ✅ Health: OK"
  else
    echo "[$TIMESTAMP] ❌ Health: FAILED ($STATUS)"
    # Send alert (email, Slack, etc.)
  fi
  
  sleep 300  # Check every 5 minutes
done

# Run in background:
chmod +x check-health.sh
./check-health.sh &
```

---

## Rollback Procedure

**If critical issue found post-deployment:**

### Immediate Actions (< 5 minutes)
1. Stop current deployment
2. Restore from database backup
3. Deploy previous working version

```bash
# Stop current backend
kill $(lsof -t -i:5000)  # Or use systemctl stop

# Restore from backup
mongorestore --uri="$PROD_MONGODB_URI" \
  --dir=/backups/mongodb/YYYY-MM-DD_HH-MM-SS

# Rollback code
git revert HEAD
git push origin main

# Restart backend
npm start
```

### Testing After Rollback
- Verify all endpoints working
- Check database integrity
- Confirm user data preserved
- Monitor logs for errors

---

## Common Issues & Troubleshooting

### Issue: "CORS error" in frontend
**Solution:**
```
1. Check backend CORS_ORIGINS in server.js
2. Verify frontend domain is in allowlist
3. Restart backend after change
4. Clear browser cache
```

### Issue: "CSRF token validation failed"
**Solution:**
```
1. Clear browser cookies
2. Refresh page
3. Check that CSRF token endpoint is accessible
4. Verify CSRF middleware is loaded
```

### Issue: "Email not sending"
**Solution:**
```
1. Verify Gmail app password (not regular password)
2. Check EMAIL_USER and EMAIL_PASS in environment
3. Verify "Less secure app access" enabled (Google settings)
4. Check email logs for delivery status
```

### Issue: "MongoDB connection timeout"
**Solution:**
```
1. Check MONGODB_URI is correct
2. Verify IP whitelist (MongoDB Atlas: Network Access)
3. Confirm cluster is running
4. Check network connectivity: telnet $MONGODB_HOST 27017
```

---

## Performance Optimization

### Enable HTTP/2
- Check hosting provider supports HTTP/2
- Should be enabled by default for HTTPS

### Content Delivery Network (CDN)
```
Consider adding Cloudflare or similar:
- Free tier available
- Improves global performance
- Adds DDoS protection
- Enabled by pointing DNS to CDN
```

### Caching Headers
```javascript
// Already set in backend (verify in server.js)
app.use((req, res, next) => {
  res.setHeader('Cache-Control', 'public, max-age=31536000');
  next();
});
```

### Image Optimization
- Ensure all user-uploaded images are optimized
- Compress PNG/JPG to < 200KB
- Consider lazy-loading images

---

## Security After Launch

### Weekly Tasks
- [ ] Review error logs for unusual patterns
- [ ] Check rate limiting stats
- [ ] Monitor database size
- [ ] Review admin access logs

### Monthly Tasks
- [ ] Rotate API keys / update Gmail password
- [ ] Review and update CORS origins if needed
- [ ] Test backup restoration
- [ ] Audit MongoDB access logs
- [ ] Review security patches for dependencies

### Quarterly Tasks
- [ ] Full security audit
- [ ] Penetration testing (consider hiring)
- [ ] Database optimization
- [ ] Performance review

---

## Contact & Support

**Issues During Deployment:**
- Backend: Check logs for error messages
- Database: Verify MongoDB connection string
- Email: Test Simple Email Service configuration
- DNS: Check propagation at whatsmydns.net

**Emergency Contact:**
- Primary: Backend logs at `/var/log/asta-mart/`
- Backup: MongoDB Atlas dashboard
- Escalation: Consider hiring DevOps support

---

**Deployment Prepared By:** Asta Mart Team  
**Date:** April 9, 2026  
**Next Review Date:** May 9, 2026
