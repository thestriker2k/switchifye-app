// RevenueCat billing — ANDROID ONLY.
//
// iOS deliberately does NOT come through here. It stays on react-native-iap +
// server-side JWS validation (lib/iap.ios.ts), because that path is live in the
// App Store and re-validating it is not worth the risk. lib/iap.ts dispatches by
// platform; nothing else should import this module directly.
//
// The exported surface mirrors lib/iap.ios.ts exactly — same names, same
// signatures, same return shapes — so app/paywall.tsx is agnostic about which
// billing system is underneath.

import Purchases, {
  LOG_LEVEL,
  type CustomerInfo,
  type PurchasesPackage,
} from 'react-native-purchases';

export const ANNUAL_SKU = 'com.switchifye.app.annual';

// Must match the entitlement identifier configured in the RevenueCat dashboard.
// Entitlement — not product — is what grants access, so a future product swap
// (price change, new SKU) doesn't require an app release.
const ENTITLEMENT_ID = 'premium';

// Public SDK key (goog_...). Safe to ship in the bundle, like the Supabase anon
// key — it can only read/write this app's RevenueCat data on behalf of the
// signed-in appUserID. Set EXPO_PUBLIC_REVENUECAT_ANDROID_KEY in the build env.
const RC_ANDROID_KEY = process.env.EXPO_PUBLIC_REVENUECAT_ANDROID_KEY ?? '';

let configured = false;

// ── Identity ───────────────────────────────────────────────────────────

/**
 * Configure the SDK with the Supabase user id as appUserID.
 *
 * Deliberately NOT called with an anonymous id: RevenueCat's app_user_id is the
 * only thing tying a Play purchase back to a Supabase row, and the webhook
 * rejects anonymous ids ($RCAnonymousID:...) precisely so a purchase can never
 * be written against a user that doesn't exist. Call this only once a session
 * has resolved.
 */
export async function configureRevenueCat(userId: string): Promise<void> {
  if (!RC_ANDROID_KEY) {
    console.warn('[RC] No Android SDK key configured — billing disabled');
    return;
  }
  if (configured) {
    // Already running: an account change is a logIn, not a reconfigure.
    await identify(userId);
    return;
  }
  if (__DEV__) await Purchases.setLogLevel(LOG_LEVEL.DEBUG);
  Purchases.configure({ apiKey: RC_ANDROID_KEY, appUserID: userId });
  configured = true;
}

export async function identify(userId: string): Promise<void> {
  if (!configured) return;
  try {
    await Purchases.logIn(userId);
  } catch (err) {
    console.error('[RC] logIn failed:', err);
  }
}

/**
 * MUST be called on sign-out. Without it the SDK keeps the previous appUserID,
 * so the next account to sign in on this device inherits the prior user's
 * entitlement state — the same device-vs-account identity trap as push tokens.
 */
export async function signOutRevenueCat(): Promise<void> {
  if (!configured) return;
  try {
    await Purchases.logOut();
  } catch (err) {
    // Logging out an already-anonymous user throws; harmless.
    console.warn('[RC] logOut failed (non-fatal):', err);
  }
}

// ── Entitlement ────────────────────────────────────────────────────────

function hasPremium(info: CustomerInfo): boolean {
  return info.entitlements.active[ENTITLEMENT_ID] !== undefined;
}

// ── Store connection ───────────────────────────────────────────────────

/**
 * No-op. RevenueCat manages the billing client's lifecycle itself; there is no
 * connection to tear down. Exported only to satisfy the shared iap surface,
 * which iOS needs because react-native-iap does hold an explicit connection.
 */
export async function disconnectFromStore(): Promise<void> {}

// ── Product fetching ───────────────────────────────────────────────────

let cachedPackage: PurchasesPackage | null = null;

/**
 * Returns just the localized price, matching what the paywall actually reads.
 * Resolves null on any failure — the paywall falls back to its hardcoded price
 * and stays usable, exactly as it does on iOS.
 */
export async function fetchAnnualProduct(): Promise<{ displayPrice: string } | null> {
  if (!configured) return null;
  const offerings = await Purchases.getOfferings();
  const current = offerings.current;
  if (!current) {
    // No CURRENT offering set in the dashboard — products alone aren't enough.
    console.warn('[RC] No current offering configured');
    return null;
  }
  const pkg =
    current.availablePackages.find((p) => p.product.identifier === ANNUAL_SKU) ??
    current.availablePackages[0];
  if (!pkg) return null;

  cachedPackage = pkg;
  return { displayPrice: pkg.product.priceString };
}

// ── Purchase ───────────────────────────────────────────────────────────

interface ListenerCallbacks {
  onSuccess: () => void;
  onError: (message: string) => void;
}

let callbacks: ListenerCallbacks | null = null;

/**
 * RevenueCat's purchase flow is promise-based rather than event-based, so there
 * is nothing to subscribe to. We stash the callbacks and invoke them from
 * buyAnnual/restorePurchases, which keeps the paywall's contract identical to
 * the iOS listener model.
 */
export function addPurchaseListeners(cb: ListenerCallbacks): () => void {
  callbacks = cb;
  return () => {
    callbacks = null;
  };
}

export async function buyAnnual(_product?: { displayPrice: string }): Promise<void> {
  if (!configured) throw new Error('Billing unavailable');

  const pkg = cachedPackage ?? (await loadPackage());
  if (!pkg) throw new Error('Subscription unavailable. Please try again.');

  try {
    const { customerInfo } = await Purchases.purchasePackage(pkg);
    if (hasPremium(customerInfo)) {
      callbacks?.onSuccess();
    } else {
      callbacks?.onError('Purchase completed but no entitlement was granted.');
    }
  } catch (err: any) {
    const code = err?.code;
    // Cancellation is not an error — swallow it so the paywall stays put with
    // no message, matching how iOS's error listener filters UserCancelled.
    if (code === Purchases.PURCHASES_ERROR_CODE.PURCHASE_CANCELLED_ERROR) return;

    // Re-word "already purchased" so it matches the string the paywall's
    // existing auto-restore branch looks for. That branch is shared with iOS
    // and stays untouched.
    if (code === Purchases.PURCHASES_ERROR_CODE.PRODUCT_ALREADY_PURCHASED_ERROR) {
      throw new Error('already owned');
    }
    throw new Error(err?.message ?? 'Purchase failed');
  }
}

async function loadPackage(): Promise<PurchasesPackage | null> {
  await fetchAnnualProduct();
  return cachedPackage;
}

// ── Restore ────────────────────────────────────────────────────────────

export async function restorePurchases(): Promise<boolean> {
  if (!configured) return false;
  const timeout = new Promise<never>((_, reject) =>
    setTimeout(() => reject(new Error('Restore timed out. Please try again.')), 15000),
  );
  return Promise.race([restoreInner(), timeout]);
}

async function restoreInner(): Promise<boolean> {
  const info = await Purchases.restorePurchases();
  return hasPremium(info);
}
