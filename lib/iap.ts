// Billing platform router.
//
// This is a PLATFORM SPLIT, not a migration:
//
//   iOS     -> lib/iap.ios.ts    react-native-iap + server-side JWS validation
//                                (/api/iap/validate-receipt). Live in the App
//                                Store. Byte-identical to the lib/iap.ts that
//                                shipped before this split — verify with:
//                                  git show <pre-split-sha>:lib/iap.ts \
//                                    | diff - lib/iap.ios.ts
//
//   Android -> lib/revenuecat.ts RevenueCat, with premium state written to
//                                Supabase by the RC webhook rather than by the
//                                client.
//
// Both modules satisfy BillingModule below, so app/paywall.tsx never branches
// on platform. Keep it that way: anything added here must exist on BOTH sides,
// or the paywall starts needing to know which store it is talking to.
//
// The iOS module still contains a react-native-iap Google Play branch in
// buyAnnual. It is now unreachable — Android never routes there. It is left in
// place deliberately so lib/iap.ios.ts stays byte-identical to the shipped file
// and the diff above keeps proving iOS is untouched.

import { Platform } from 'react-native';

import * as ios from './iap.ios';
import * as android from './revenuecat';

/**
 * The only thing the paywall reads off a product. Modelled structurally so both
 * react-native-iap's ProductSubscription and RevenueCat's package satisfy it.
 */
export type BillingProduct = { displayPrice: string };

export interface BillingListeners {
  onSuccess: () => void;
  onError: (message: string) => void;
}

/**
 * Methods are declared with method syntax on purpose: TypeScript treats their
 * parameters bivariantly, which lets the iOS module keep its narrower
 * ProductSubscription parameter without a cast. That is sound here because a
 * product object is only ever produced and consumed by the SAME module — the
 * paywall just passes back whatever fetchAnnualProduct handed it.
 */
export interface BillingModule {
  ANNUAL_SKU: string;
  disconnectFromStore(): Promise<void>;
  fetchAnnualProduct(): Promise<BillingProduct | null>;
  buyAnnual(product?: BillingProduct): Promise<void>;
  addPurchaseListeners(callbacks: BillingListeners): () => void;
  restorePurchases(): Promise<boolean>;
}

const impl: BillingModule = Platform.OS === 'android' ? android : ios;

export const ANNUAL_SKU = impl.ANNUAL_SKU;

export const disconnectFromStore = impl.disconnectFromStore;
export const fetchAnnualProduct = impl.fetchAnnualProduct;
export const buyAnnual = impl.buyAnnual;
export const addPurchaseListeners = impl.addPurchaseListeners;
export const restorePurchases = impl.restorePurchases;
