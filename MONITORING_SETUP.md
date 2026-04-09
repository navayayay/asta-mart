# Asta Mart - Monitoring & Observability Setup

**Last Updated:** April 9, 2026  
**Status:** Recommended for Post-Launch  
**Effort:** 30 minutes setup

---

## Overview

Production monitoring helps catch issues before users do. This guide covers setting up error tracking, performance monitoring, and alerting.

---

## Option 1: Sentry Error Tracking (Recommended)

### Why Sentry?
- Captures all JavaScript errors on frontend & backend
- Groups similar errors together
- Tracks error trends over time
- Free tier with 5,000 events/month
- Integrates with Slack for real-time alerts

### Setup (15 minutes)

**Step 1: Create Sentry Account**
1. Go to https://sentry.io/signup/
2. Create free account
3. Create new project: Select "Node.js" for backend
4. Get your DSN (looks like: https://abc123@o456.ingest.sentry.io/789)

**Step 2: Install Sentry in Backend**
```bash
cd backend
npm install @sentry/node
```

**Step 3: Add Sentry to server.js**
Insert near the top of `backend/server.js`:
```javascript
const Sentry = require('@sentry/node');

// Initialize Sentry FIRST, before other requires
Sentry.init({
  dsn: process.env.SENTRY_DSN,  // Add to .env
  environment: process.env.NODE_ENV || 'development',
  tracesSampleRate: process.env.NODE_ENV === 'production' ? 0.1 : 1.0,
  integrations: [
    new Sentry.Integrations.Http({ tracing: true })
  ]
});

// Add request handler middleware EARLY
app.use(Sentry.Handlers.requestHandler());

// ... rest of your middleware ...

// Add error handler middleware LAST (before app.listen)
app.use(Sentry.Handlers.errorHandler());
```

**Step 4: Add SENTRY_DSN to Environment**
```bash
# In .env or hosting provider secrets:
SENTRY_DSN=https://abc123@o456.ingest.sentry.io/789
```

**Step 5: Test Error Capture**
```bash
# Trigger a test error
curl https://api.asta-mart.in/api/test-error

# Check Sentry dashboard - should show error
```

### Sentry Dashboard Features
- **Releases**: Track which version has which errors
- **Performance**: Identify slow endpoints
- **Alerts**: Get notified of new errors via email
- **Integrations**: Connect to Slack for real-time alerts

---

## Option 2: Google Analytics (Performance)

### Setup (5 minutes)

**Step 1: Add Google Analytics to Frontend**
Edit each HTML file (index.html, browse.html, etc.) - add before `</head>`:
```html
<!-- Google Analytics -->
<script async src="https://www.googletagmanager.com/gtag/js?id=G-XXXXXXXXXX"></script>
<script>
  window.dataLayer = window.dataLayer || [];
  function gtag(){dataLayer.push(arguments);}
  gtag('js', new Date());
  gtag('config', 'G-XXXXXXXXXX');  // Replace with your GA ID
</script>
```

**Step 2: Create Google Analytics Account**
1. Visit https://analytics.google.com
2. Create new property for https://asta-mart.in
3. Get your Measurement ID (G-XXXXXXXXXX)
4. Replace in HTML above

### What to Monitor
- **Users:** Daily/Weekly Active Users
- **Page Views:** Which pages most popular
- **Bounce Rate:** Users leaving without action
- **Conversion:** Signup → Listing Creation
- **Device Breakdown:** Desktop vs Mobile usage

---

## Option 3: Simple Logging (Budget-Friendly)

If you don't want paid services, implement simple file-based logging:

```javascript
// Add to backend/server.js
const fs = require('fs');
const path = require('path');

const logDir = '/var/log/asta-mart';
if (!fs.existsSync(logDir)) {
  fs.mkdirSync(logDir, { recursive: true });
}

// Custom error logger
function logError(error) {
  const timestamp = new Date().toISOString();
  const logEntry = `[${timestamp}] ERROR: ${error.message}\n${error.stack}\n\n`;
  
  fs.appendFileSync(
    path.join(logDir, 'errors.log'),
    logEntry
  );
  
  console.error(logEntry);
}

// Use in error handlers:
app.use((err, req, res, next) => {
  logError(err);
  res.status(500).json({ error: 'Internal server error' });
});
```

**Monitor logs:**
```bash
# Watch error logs in real-time
tail -f /var/log/asta-mart/errors.log

# Search for specific errors
grep "CSRF" /var/log/asta-mart/errors.log
grep "MongoDB" /var/log/asta-mart/errors.log

# Count errors by type
grep "ERROR" /var/log/asta-mart/errors.log | cut -d: -f2 | sort | uniq -c
```

---

## Health Check Endpoint

Create a simple health check that monitoring tools can ping:

```javascript
// Add to backend/server.js
app.get('/health', (req, res) => {
  res.status(200).json({
    status: 'ok',
    timestamp: new Date().toISOString(),
    uptime: Math.floor(process.uptime()),
    mongodb: mongoose.connection.readyState === 1 ? 'connected' : 'disconnected'
  });
});
```

**Test it:**
```bash
curl https://api.asta-mart.in/health

# Should return:
# {
#   "status": "ok",
#   "timestamp": "2026-04-09T10:30:00Z",
#   "uptime": 3600,
#   "mongodb": "connected"
# }
```

---

## Alerting Setup

### Email Alerts (Free)
Configure Sentry to email on critical errors:
1. Sentry Dashboard → Project → Alerts
2. Create New Alert Rule
3. Condition: Event Frequency > 10 errors/hour
4. Action: Send email to ops@asta-mart.in

### Slack Integration (Optional)
1. Create Slack workspace
2. Sentry → Settings → Integrations → Slack
3. Connect and select channel for errors
4. Now get real-time error notifications in Slack

---

## Key Metrics to Monitor

### Backend Health
```javascript
// Track key metrics
const metrics = {
  requestsPerSecond: 0,
  errorRate: 0,
  databaseLatency: 0,
  uptime: 0
};

// Update every 60 seconds
setInterval(() => {
  // Calculate and log metrics
}, 60000);
```

### Monitor These Endpoints
- `GET /` - Homepage response time
- `GET /api/listings` - List page (high traffic)
- `POST /api/listings` - Listing creation (important)
- `POST /api/auth/send-otp` - User signup (critical)
- `POST /api/vault/sync` - Account sync (heavy operation)

### Alert Thresholds
```
Set alerts for:
- Response time > 2 seconds (high latency)
- Error rate > 1% (too many failures)
- Database latency > 1 second (database issue)
- CPU usage > 80% (system overload)
- Memory usage > 85% (running out of RAM)
```

---

## Database Monitoring

### MongoDB Monitoring
```javascript
// Add to backend/server.js
mongoose.connection.on('connected', () => {
  console.log('✅ MongoDB Connected');
});

mongoose.connection.on('disconnected', () => {
  console.error('❌ MongoDB Disconnected - ALERT!');
  // Send alert
});

// Monitor slow queries
mongoose.set('debug', process.env.NODE_ENV !== 'production');
```

### Check Database Stats
```bash
# Via MongoDB shell
db.serverStatus() | grep connections
db.serverStatus() | grep replication
db.stats()

# Check slow queries
db.system.profile.find().limit(10)
```

---

## Performance Optimization Based on Metrics

### If Response Time Slow
1. Add database indexes
2. Cache frequent queries
3. Enable gzip compression
4. Use CDN for static files

### If Error Rate High
1. Review error logs
2. Check error patterns
3. Fix root cause errors
4. Update error handling

### If Memory Growing
1. Check for memory leaks
2. Restart application weekly
3. Monitor MongoDB connection pool
4. Review large queries

---

## Monthly Monitoring Review

Schedule monthly review of:

```checklist
- [ ] Error trends: Increasing or decreasing?
- [ ] Performance trends: Getting slower?
- [ ] User growth: Scaling as expected?
- [ ] Database size: Still room for growth?
- [ ] Top errors: What to fix next?
- [ ] New features impact: Performance regression?
```

---

## Tools Comparison

| Tool | Cost | Setup Time | Features | Recommendation |
|------|------|-----------|----------|-----------------|
| Sentry | Free tier available | 15 min | Error tracking, performance | **RECOMMENDED** |
| Google Analytics | Free | 5 min | User behavior, traffic | Use together |
| Datadog | $15+/month | 20 min | All-in-one monitoring | If budget allows |
| New Relic | Free tier available | 20 min | APM, full stack | Enterprise option |
| Simple Logging | Free | 10 min | Basic error tracking | Minimum viable |
| Uptime Robot | Free tier | 5 min | Uptime monitoring | Free alternative |

---

## Next Steps

1. **Week 1:** Set up Sentry error tracking
2. **Week 2:** Add Google Analytics for user behavior
3. **Week 3:** Configure alerts and dashboard
4. **Week 4:** Review first month of data and optimize

---

**Prepared By:** Asta Mart DevOps Team  
**Date:** April 9, 2026  
**Next Review:** May 9, 2026
