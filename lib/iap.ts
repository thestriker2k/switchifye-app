import { Platform } from 'react-native';
import {
  initConnection,
  endConnection,
  fetchProducts,
  requestPurchase,
  getAvailablePurchases,
  purchaseUpdatedListener,
  purchaseErrorListener,
  finishTransaction,
  ErrorCode,
  type Purchase,
  type PurchaseError,
  type ProductSubscription,
  type EventSubscription,
} from 'react-native-iap';
import { supabase } from '../lib/supabase';

export const ANNUAL_SKU = 'com.switchifye.app.annual';

const VALIDATE_URL = 'https://app.switchifye.com/api/iap/validate-receipt';

// ── Store connection (with retry) ─────────────────────────────────────

async function ensureConnection(): Promise<void> {
  try {
    await initConnection();
  } catch (err) {
    // Wait 1 second and retry once
    await new Promise((r) => setTimeout(r, 1000));
    await initConnection();
  }
}

export async function disconnectFromStore(): Promise<void> {
  try {
    await endConnection();
  } catch (err) {
    console.error('[IAP] Disconnect error:', err);
  }
}

// ── Product fetching ───────────────────────────────────────────────────

export async function fetchAnnualProduct(): Promise<ProductSubscription | null> {
  await ensureConnection();
  const products = await fetchProducts({ skus: [ANNUAL_SKU], type: 'subs' });
  if (!products || products.length === 0) return null;
  return products[0] as ProductSubscription;
}

// ── Purchase ───────────────────────────────────────────────────────────

export async function buyAnnual(subscription?: ProductSubscription): Promise<void> {
  await ensureConnection();
  if (Platform.OS === 'ios') {
    await requestPurchase({
      request: { apple: { sku: ANNUAL_SKU } },
      type: 'subs',
    });
  } else {
    const offerToken =
      (subscription as any)?.subscriptionOfferDetails?.[0]?.offerToken ?? '';
    await requestPurchase({
      request: {
        google: {
          skus: [ANNUAL_SKU],
          subscriptionOffers: [{ sku: ANNUAL_SKU, offerToken }],
        },
      },
      type: 'subs',
    });
  }
}

// ── Listeners ──────────────────────────────────────────────────────────

interface ListenerCallbacks {
  onSuccess: () => void;
  onError: (message: string) => void;
}

export function addPurchaseListeners({ onSuccess, onError }: ListenerCallbacks): () => void {
  const updateSub: EventSubscription = purchaseUpdatedListener(async (purchase: Purchase) => {
    try {
      await validateReceiptOnServer(purchase);
      await finishTransaction({ purchase, isConsumable: false });
      onSuccess();
    } catch (err: any) {
      onError(err.message || 'Validation failed');
    }
  });

  const errorSub: EventSubscription = purchaseErrorListener((error: PurchaseError) => {
    if (error.code === ErrorCode.UserCancelled) return;
    onError(error.message || 'Purchase failed');
  });

  return () => {
    updateSub.remove();
    errorSub.remove();
  };
}

// ── Restore ────────────────────────────────────────────────────────────

export async function restorePurchases(): Promise<boolean> {
  const timeout = new Promise<never>((_, reject) =>
    setTimeout(() => reject(new Error('Restore timed out. Please try again.')), 15000),
  );

  return Promise.race([restorePurchasesInner(), timeout]);
}

async function restorePurchasesInner(): Promise<boolean> {
  await ensureConnection();
  console.log('[IAP] restoring: fetching purchases');
  const purchases = await getAvailablePurchases();
  console.log('[IAP] restoring: got purchases', purchases.length);
  const annual = purchases.find((p) => p.productId === ANNUAL_SKU);
  if (!annual) return false;

  console.log('[IAP] restoring: validating receipt');
  await validateReceiptOnServer(annual);

  console.log('[IAP] restoring: finishing transaction');
  try {
    await finishTransaction({ purchase: annual, isConsumable: false });
  } catch (err) {
    // Subscription is already activated server-side; finishing is just cleanup
    console.warn('[IAP] restoring: finishTransaction failed (non-fatal):', err);
  }

  console.log('[IAP] restoring: done');
  return true;
}

// ── Server validation (private) ────────────────────────────────────────

async function validateReceiptOnServer(purchase: Purchase): Promise<void> {
  const { data: sessionData } = await supabase.auth.getSession();
  const token = sessionData.session?.access_token;
  if (!token) throw new Error('Not authenticated');

  const res = await fetch(VALIDATE_URL, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      platform: Platform.OS,
      productId: purchase.productId,
      transactionId: (purchase as any).transactionId ?? purchase.id,
      receipt: purchase.purchaseToken ?? '',
    }),
  });

  const data = await res.json();
  if (!res.ok || !data.valid) {
    throw new Error(data.error || 'Receipt validation failed');
  }
}
