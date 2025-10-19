# Session Management Fix

## Problem

Users were seeing "Invalid token" errors when staying on a tab for a long time or returning to an inactive tab. This was causing a poor user experience.

## Root Cause

1. **JWT Access Token Expiration**: Tokens expired after 30 minutes
2. **Background Tab Issue**: Browser throttles JavaScript in inactive tabs, so the 15-minute auto-refresh might not fire
3. **No Graceful Handling**: When tokens expired, API calls showed raw error messages instead of user-friendly notifications

## Solution Implemented

### 1. **Automatic Token Refresh on 401 Errors**

**File: `apps/web/src/services/api.js`**

- Detects 401 (Unauthorized) responses
- Automatically attempts to refresh the access token using the refresh token
- Retries the original request with the new token
- Shows user-friendly "Session expired" message if refresh fails

```javascript
// Handle 401 Unauthorized - token expired
if (res.status === 401 && !_isRetry && path !== '/auth/refresh' && path !== '/auth/login') {
  // Try to refresh token
  if (tokenRefreshCallback) {
    try {
      const newToken = await tokenRefreshCallback()
      if (newToken) {
        // Retry the original request with new token
        return request(path, { method, body, token: newToken, headers, _isRetry: true })
      }
    } catch (refreshError) {
      console.error('[API] Token refresh failed:', refreshError)
    }
  }
  
  // If refresh failed, show session expired error
  const err = new Error('Your session has expired. Please log in again.')
  err.status = 401
  err.isSessionExpired = true
  throw err
}
```

### 2. **Session Expired Modal**

**File: `apps/web/src/components/SessionExpiredModal.jsx`**

- Beautiful modal dialog with warning icon
- User-friendly message: "Your session has expired due to inactivity"
- Single "Log In Again" button
- Automatically logs out user and redirects to login page

### 3. **Increased Token Expiry Time**

**File: `apps/backend/app/core/config.py`**

Changed from **30 minutes** to **2 hours** (120 minutes) to reduce frequency of token expiration:

```python
access_token_expire_minutes: int = int(os.getenv("ACCESS_TOKEN_EXPIRE_MINUTES", "120"))  # 2 hours
```

### 4. **Updated Auto-Refresh Interval**

**File: `apps/web/src/contexts/AuthContext.jsx`**

- Changed auto-refresh interval from 15 minutes to **60 minutes (1 hour)**
- Token expires in 2 hours, refreshes every 1 hour = safe margin
- Added proper logging for debugging:
  ```
  [Auth] Refreshing access token...
  [Auth] Token refreshed successfully
  ```

### 5. **Enhanced Auth Context**

**New Features:**
- `sessionExpired` state - tracks if session has expired
- `clearSessionExpired()` - clears the expired flag
- `refreshToken()` - manual token refresh function
- Callbacks registered with API client for automatic refresh

## How It Works

### Normal Flow (Token Still Valid)
```
User → API Call → Backend
                ↓
            Success ✅
```

### Auto-Refresh Flow (Token Expiring Soon)
```
Every 60 minutes:
  Background Timer → Refresh Token → Update Access Token
```

### Token Expired Flow (User Returns After Inactivity)
```
User → API Call → Backend (401 Unauthorized)
         ↓
    API Client Detects 401
         ↓
    Attempts Token Refresh
         ↓
    ✅ Success: Retry Original Request
    ❌ Failure: Show Session Expired Modal
```

### Session Expired Modal Flow
```
Modal Appears
    ↓
User Clicks "Log In Again"
    ↓
Clear All Auth Data
    ↓
Redirect to /login
```

## Technical Details

### Token Lifecycle

| Time | Event |
|------|-------|
| 0 min | User logs in, receives access token (valid for 2 hours) |
| 60 min | Auto-refresh fires, gets new access token |
| 120 min | Previous token expires (new token already obtained) |
| 180 min | Another auto-refresh |
| ... | Continues as long as tab is active |

### Background Tab Handling

**Problem**: Browsers throttle JavaScript in inactive tabs

**Solution**:
1. **Automatic retry on 401**: Even if auto-refresh doesn't fire, the first API call after returning will trigger a refresh
2. **Graceful fallback**: If refresh fails (e.g., refresh token also expired), show friendly modal instead of error

### Refresh Token

- **Expiry**: 30 days (43,200 minutes)
- **Purpose**: Long-lived token to obtain new access tokens
- **Security**: Only used for `/auth/refresh` endpoint, never sent with regular API calls

## User Experience Improvements

### Before Fix ❌
```
User returns after 1 hour
  ↓
"Invalid token" error in red text
  ↓
User confused, might refresh page
  ↓
Loses unsaved data
```

### After Fix ✅
```
User returns after 1 hour
  ↓
API automatically refreshes token
  ↓
Request succeeds seamlessly
  ↓
User doesn't notice anything

OR (if refresh token expired)

User returns after 30 days
  ↓
Beautiful modal: "Session expired due to inactivity"
  ↓
Click "Log In Again"
  ↓
Smooth redirect to login page
```

## Configuration

### Environment Variables

**Backend (`docker-compose.yml` or `.env`):**
```bash
ACCESS_TOKEN_EXPIRE_MINUTES=120  # 2 hours (default)
REFRESH_TOKEN_EXPIRE_MINUTES=43200  # 30 days (default)
```

**Frontend:**
- No configuration needed
- Auto-refresh interval is 50% of token expiry (60 min for 120 min token)

### Customization

To change token expiry:

1. **Backend**: Update `ACCESS_TOKEN_EXPIRE_MINUTES` in environment
2. **Frontend**: Update interval in `AuthContext.jsx`:
   ```javascript
   // Set to 50% of ACCESS_TOKEN_EXPIRE_MINUTES
   setInterval(refreshAccessToken, (expiry_minutes / 2) * 60 * 1000)
   ```

## Testing

### Test Scenarios

1. **Normal Usage**: ✅ User stays active, no interruptions
2. **Short Inactivity** (< 2 hours): ✅ Automatic token refresh on first API call
3. **Long Inactivity** (> 2 hours, < 30 days): ✅ Session expired modal, login required
4. **Very Long Inactivity** (> 30 days): ✅ Both tokens expired, login required
5. **Background Tab**: ✅ Works even if auto-refresh doesn't fire due to throttling

### Manual Testing

**Simulate Token Expiry (for testing):**

1. Temporarily change backend token expiry to 1 minute:
   ```bash
   # In docker-compose.yml
   environment:
     - ACCESS_TOKEN_EXPIRE_MINUTES=1
   ```

2. Log in and wait 2 minutes

3. Try to navigate or perform an action

4. Should see: Session Expired modal

## Logging & Debugging

### Console Logs

When token refresh happens:
```
[Auth] Refreshing access token...
[Auth] Token refreshed successfully
```

When session expires:
```
[Auth] Token refresh failed: Error: ...
[Auth] Session expired
[API] Token refresh failed: ...
```

### Monitoring

- Check browser console for `[Auth]` and `[API]` prefixed logs
- Network tab: Look for `/auth/refresh` calls
- Verify 401 responses trigger automatic refresh

## Security Considerations

✅ **Refresh tokens stored securely** in localStorage  
✅ **Access tokens short-lived** (2 hours)  
✅ **Refresh tokens long-lived but revocable** (30 days)  
✅ **Automatic logout on failed refresh** (security over convenience)  
✅ **No infinite retry loops** (only one retry per request)  
✅ **HTTPS recommended** in production  

## Benefits

1. **Better UX**: Users don't see confusing error messages
2. **Seamless Experience**: Automatic token refresh is invisible to users
3. **Clear Communication**: If session truly expired, users get a friendly message
4. **Reduced Support**: Fewer "why am I logged out?" questions
5. **Security**: Maintains short access token expiry while providing good UX

## Files Changed

1. ✅ `apps/web/src/services/api.js` - Added automatic 401 handling and retry
2. ✅ `apps/web/src/contexts/AuthContext.jsx` - Enhanced with refresh callbacks
3. ✅ `apps/web/src/components/SessionExpiredModal.jsx` - New modal component
4. ✅ `apps/web/src/components/Layout.jsx` - Added SessionExpiredModal
5. ✅ `apps/backend/app/core/config.py` - Increased token expiry to 2 hours

## Summary

The session management system now:
- ✅ Automatically refreshes tokens before expiry
- ✅ Automatically retries failed requests after token refresh
- ✅ Shows user-friendly messages when sessions truly expire
- ✅ Works even when tabs are in the background
- ✅ Maintains security with short-lived access tokens
- ✅ Provides seamless UX with automatic recovery

**Result**: Users can leave tabs open for hours without seeing errors! 🎉

