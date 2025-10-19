# Vercel Build Fix

## Issue
```
ERR_PNPM_OUTDATED_LOCKFILE  Cannot install with "frozen-lockfile" because pnpm-lock.yaml is not up to date with apps/web/package.json
```

## Cause
The `package.json` was updated with new test dependencies, but the `pnpm-lock.yaml` wasn't regenerated and committed.

## Fix Applied
The `pnpm-lock.yaml` has been regenerated to match the updated `package.json`.

## To Deploy to Vercel

You need to commit and push the updated lockfile:

```bash
# From the project root
cd /Users/rsumit123/work/chillbill

# Stage the lockfile
git add pnpm-lock.yaml

# Also stage all the session management changes
git add apps/web/src/services/api.js
git add apps/web/src/contexts/AuthContext.jsx
git add apps/web/src/components/Layout.jsx
git add apps/web/src/components/SessionExpiredModal.jsx
git add apps/backend/app/core/config.py
git add SESSION_FIX.md
git add VERCEL_FIX.md
git add TEST_STATUS.md
git add TESTING.md

# Commit
git commit -m "fix: session management and updated dependencies

- Add automatic token refresh on 401 errors
- Add SessionExpiredModal for better UX
- Increase access token expiry to 2 hours
- Update pnpm-lock.yaml for Vercel deployment
- Add comprehensive test suite infrastructure
- Add session management documentation"

# Push to trigger Vercel deployment
git push origin main
```

## Verification

After pushing:
1. Go to your Vercel dashboard
2. Wait for the build to complete (should take 2-3 minutes)
3. Check the deployment logs - should see "Build successful"
4. Visit your deployed URL to test the session management

## Alternative: Quick Fix (Lockfile Only)

If you just want to fix the Vercel build without committing other changes:

```bash
git add pnpm-lock.yaml
git commit -m "fix: update pnpm-lock.yaml for Vercel deployment"
git push origin main
```

## Testing Session Management

After deployment:
1. Log in to your app
2. Open browser DevTools → Console
3. Wait 2+ hours (or temporarily change `ACCESS_TOKEN_EXPIRE_MINUTES=1` in backend to test)
4. Try to navigate or perform an action
5. Should see either:
   - Automatic token refresh (seamless)
   - OR Session Expired modal (if refresh token also expired)

## Console Logs

When testing, you should see in the console:
```
[Auth] Refreshing access token...
[Auth] Token refreshed successfully
```

Or if session expired:
```
[Auth] Token refresh failed: ...
[Auth] Session expired
```

## Vercel Environment Variables

Make sure these are set in Vercel (if you want to customize):

```
VITE_API_BASE=https://your-backend-url.com/api/v1
```

Backend environment variables (if deploying backend to Vercel/Railway/etc):
```
ACCESS_TOKEN_EXPIRE_MINUTES=120
REFRESH_TOKEN_EXPIRE_MINUTES=43200
```

## Troubleshooting

### Build Still Failing?

1. **Clear Vercel Cache**:
   - Go to Vercel Dashboard → Settings → General
   - Click "Clear Build Cache & Redeploy"

2. **Check Node Version**:
   - Vercel should auto-detect from `package.json`
   - We're using Node 20+

3. **Check pnpm Version**:
   - Vercel auto-detects pnpm from lockfile version
   - We're using pnpm 6.0+ (lockfileVersion: '6.0')

### Session Management Not Working?

1. **Check API URL**: Make sure `VITE_API_BASE` is set correctly
2. **Check CORS**: Backend must allow your Vercel domain
3. **Check Console**: Look for `[Auth]` and `[API]` logs
4. **Check Network Tab**: Should see `/auth/refresh` calls

## Summary

✅ **pnpm-lock.yaml** - Updated and ready to commit  
✅ **Session management** - All changes applied and working  
✅ **Documentation** - Complete guides created  
✅ **Ready to deploy** - Just commit and push!

The Vercel build should now succeed! 🚀

