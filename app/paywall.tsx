import { useEffect, useState } from 'react';
import {
  StyleSheet,
  View,
  Text,
  TouchableOpacity,
  SafeAreaView,
  ActivityIndicator,
  ScrollView,
  Linking,
} from 'react-native';
import { useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import type { ProductSubscription } from 'react-native-iap';
import { supabase, SUPABASE_URL, SUPABASE_ANON_KEY } from '../lib/supabase';
import {
  disconnectFromStore,
  fetchAnnualProduct,
  buyAnnual,
  restorePurchases,
  addPurchaseListeners,
} from '../lib/iap';

// ── Feature data ───────────────────────────────────────────────────────

const FEATURES: { icon: keyof typeof Ionicons.glyphMap; title: string; desc: string }[] = [
  {
    icon: 'shield-checkmark',
    title: 'Unlimited Switches',
    desc: 'Create as many safety switches as you need',
  },
  {
    icon: 'people',
    title: 'Unlimited Contacts',
    desc: 'Add all the contacts you want to notify',
  },
  {
    icon: 'time-outline',
    title: 'All Check-In Intervals',
    desc: 'Choose any check-in interval that works for you',
  },
  {
    icon: 'mail-outline',
    title: 'Email Notifications',
    desc: 'Get notified when switches are triggered',
  },
  {
    icon: 'flash',
    title: 'Priority Support',
    desc: 'Get help when you need it',
  },
];

// ── Component ──────────────────────────────────────────────────────────

export default function PaywallScreen() {
  const router = useRouter();
  const [loading, setLoading] = useState(true);
  const [purchasing, setPurchasing] = useState(false);
  const [restoring, setRestoring] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [product, setProduct] = useState<ProductSubscription | null>(null);
  const [alreadySubscribed, setAlreadySubscribed] = useState(false);

  const dismissPaywall = () => {
    console.log("DISMISSING PAYWALL");
    router.replace({ pathname: "/" });
  };

  useEffect(() => {
    const cleanup = addPurchaseListeners({
      onSuccess: () => {
        setPurchasing(false);
        setRestoring(false);
        router.replace('/');
      },
      onError: (msg) => {
        setPurchasing(false);
        setRestoring(false);
        setError(msg);
      },
    });

    async function init() {
      try {
        // Check if user already has an active subscription
        const { data: sessionData } = await supabase.auth.getSession();
        const session = sessionData.session;
        if (session) {
          const res = await fetch(
            `${SUPABASE_URL}/rest/v1/subscriptions?user_id=eq.${session.user.id}&status=in.(active,grace_period,billing_retry)&select=status,plan_id`,
            {
              headers: {
                Authorization: `Bearer ${session.access_token}`,
                apikey: SUPABASE_ANON_KEY,
              },
            },
          );
          if (res.ok) {
            const rows = await res.json();
            if (rows.length > 0 && rows[0].plan_id !== 'free') {
              setAlreadySubscribed(true);
              setLoading(false);
              return;
            }
          }
        }

        // Try to fetch product for localized price — silently fall back to $11.99
        try {
          const sub = await fetchAnnualProduct();
          if (sub) setProduct(sub);
        } catch {
          // Connection or product fetch failed — paywall still renders with fallback price
        }
      } catch {
        // Subscription check failed — continue showing paywall
      } finally {
        setLoading(false);
      }
    }

    init();

    return () => {
      cleanup();
      disconnectFromStore();
    };
  }, []);

  const localizedPrice = product?.displayPrice ?? '$11.99';

  const handleSubscribe = async () => {
    setError(null);
    setPurchasing(true);
    try {
      await buyAnnual(product ?? undefined);
    } catch (err: any) {
      const msg = (err.message || err.code || '').toLowerCase();
      if (msg.includes('already owned') || msg.includes('e_already_owned')) {
        console.log('[IAP] Item already owned — auto-restoring...');
        setPurchasing(false);
        setRestoring(true);
        try {
          const found = await restorePurchases();
          if (found) {
            setRestoring(false);
            router.replace('/');
          } else {
            setRestoring(false);
            setError('You already have a subscription. Please tap Restore Purchase to activate it.');
          }
        } catch (restoreErr: any) {
          setRestoring(false);
          setError(restoreErr.message || 'Restore failed');
        }
      } else {
        setPurchasing(false);
        setError(err.message || 'Something went wrong');
      }
    }
  };

  const handleRestore = async () => {
    setError(null);
    setRestoring(true);
    try {
      const found = await restorePurchases();
      if (found) {
        setRestoring(false);
        router.replace('/');
      } else {
        setError('No previous subscription found.');
        setRestoring(false);
      }
    } catch (err: any) {
      setError(err.message || 'Restore failed');
      setRestoring(false);
    }
  };

  // ── Already subscribed state ─────────────────────────────────────────

  if (alreadySubscribed) {
    return (
      <SafeAreaView style={styles.safe}>
        <ScrollView contentContainerStyle={styles.subscribedScroll} bounces={false}>
          <TouchableOpacity style={styles.closeBtn} onPress={dismissPaywall}>
            <Ionicons name="close" size={26} color="rgba(255,255,255,0.6)" />
          </TouchableOpacity>

          <View style={styles.subscribedContent}>
            <LinearGradient
              colors={['#4A9FF5', '#3EEBBE']}
              start={{ x: 0, y: 0 }}
              end={{ x: 1, y: 1 }}
              style={styles.heroCircle}
            >
              <Ionicons name="checkmark-circle" size={40} color="#fff" />
            </LinearGradient>
            <Text style={styles.heroTitle}>Already Subscribed</Text>
            <Text style={styles.heroSubtitle}>
              You already have an active subscription. Enjoy all Premium features!
            </Text>
            <TouchableOpacity
              onPress={dismissPaywall}
              activeOpacity={0.8}
              style={{ width: '100%', marginTop: 32 }}
            >
              <LinearGradient
                colors={['#4A9FF5', '#3EEBBE']}
                start={{ x: 0, y: 0 }}
                end={{ x: 1, y: 0 }}
                style={styles.ctaBtn}
              >
                <Text style={styles.ctaText}>Go Back</Text>
              </LinearGradient>
            </TouchableOpacity>
          </View>
        </ScrollView>
      </SafeAreaView>
    );
  }

  // ── Purchase UI ──────────────────────────────────────────────────────

  return (
    <SafeAreaView style={styles.safe}>
      <ScrollView contentContainerStyle={styles.scroll} bounces={false}>
        {/* Close button */}
        <TouchableOpacity style={styles.closeBtn} onPress={dismissPaywall}>
          <Ionicons name="close" size={26} color="rgba(255,255,255,0.6)" />
        </TouchableOpacity>

        {/* Hero */}
        <View style={styles.hero}>
          <LinearGradient
            colors={['#4A9FF5', '#3EEBBE']}
            start={{ x: 0, y: 0 }}
            end={{ x: 1, y: 1 }}
            style={styles.heroCircle}
          >
            <Ionicons name="shield-checkmark" size={40} color="#fff" />
          </LinearGradient>
          <Text style={styles.heroTitle}>Upgrade to Premium</Text>
          <Text style={styles.heroSubtitle}>
            Everything Switchifye offers, all updates, one simple annual plan.
          </Text>
        </View>

        {/* Features */}
        <View style={styles.features}>
          {FEATURES.map((f) => (
            <View key={f.title} style={styles.featureRow}>
              <LinearGradient
                colors={['#4A9FF5', '#3EEBBE']}
                start={{ x: 0, y: 0 }}
                end={{ x: 1, y: 1 }}
                style={styles.featureIcon}
              >
                <Ionicons name={f.icon} size={18} color="#fff" />
              </LinearGradient>
              <View style={styles.featureText}>
                <Text style={styles.featureTitle}>{f.title}</Text>
                <Text style={styles.featureDesc}>{f.desc}</Text>
              </View>
            </View>
          ))}
        </View>

        {/* Price card */}
        <View style={styles.priceCard}>
          <Text style={styles.priceLabel}>Annual Plan</Text>
          <View style={styles.priceRow}>
            <Text style={styles.priceAmount}>{localizedPrice}</Text>
            <Text style={styles.pricePeriod}>/year</Text>
          </View>
          <Text style={styles.priceNote}>Auto-renews annually. Cancel anytime.</Text>
        </View>

        {/* Error banner */}
        {error && (
          <View style={styles.errorBanner}>
            <Ionicons name="warning" size={16} color="#f87171" />
            <Text style={styles.errorText}>{error}</Text>
          </View>
        )}

        {/* Subscribe button */}
        <TouchableOpacity
          onPress={handleSubscribe}
          disabled={loading || purchasing || restoring}
          activeOpacity={0.8}
        >
          <LinearGradient
            colors={['#4A9FF5', '#3EEBBE']}
            start={{ x: 0, y: 0 }}
            end={{ x: 1, y: 0 }}
            style={[styles.ctaBtn, (loading || purchasing) && styles.ctaDisabled]}
          >
            {purchasing ? (
              <ActivityIndicator size="small" color="#fff" />
            ) : (
              <Text style={styles.ctaText}>Subscribe Now</Text>
            )}
          </LinearGradient>
        </TouchableOpacity>

        {/* Restore */}
        <TouchableOpacity
          onPress={handleRestore}
          disabled={loading || purchasing || restoring}
          activeOpacity={0.7}
          style={styles.restoreBtn}
        >
          {restoring ? (
            <ActivityIndicator size="small" color="rgba(255,255,255,0.5)" />
          ) : (
            <Text style={styles.restoreText}>Restore Purchase</Text>
          )}
        </TouchableOpacity>

        {/* Legal */}
        <Text style={styles.legal}>
          Payment will be charged to your Apple ID account at confirmation of purchase.
          Subscription automatically renews unless it is canceled at least 24 hours before the
          end of the current period. Your account will be charged for renewal within 24 hours
          prior to the end of the current period. You can manage and cancel your subscriptions
          by going to your account settings on the App Store after purchase.
        </Text>

        <View style={styles.legalLinks}>
          <TouchableOpacity onPress={() => Linking.openURL('https://switchifye.com/terms')}>
            <Text style={styles.legalLink}>Terms of Service</Text>
          </TouchableOpacity>
          <Text style={styles.legalSeparator}>|</Text>
          <TouchableOpacity onPress={() => Linking.openURL('https://switchifye.com/privacy')}>
            <Text style={styles.legalLink}>Privacy Policy</Text>
          </TouchableOpacity>
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}

// ── Styles ─────────────────────────────────────────────────────────────

const styles = StyleSheet.create({
  safe: {
    flex: 1,
    backgroundColor: '#0A0F1C',
  },
  scroll: {
    paddingHorizontal: 24,
    paddingBottom: 40,
  },
  subscribedScroll: {
    paddingHorizontal: 24,
    paddingBottom: 40,
    flex: 1,
  },
  subscribedContent: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  closeBtn: {
    alignSelf: 'flex-start',
    padding: 8,
    marginTop: 4,
    marginLeft: -8,
  },

  // Hero
  hero: {
    alignItems: 'center',
    marginTop: 8,
    marginBottom: 32,
  },
  heroCircle: {
    width: 80,
    height: 80,
    borderRadius: 40,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 20,
  },
  heroTitle: {
    fontSize: 28,
    fontWeight: '700',
    color: '#fff',
    letterSpacing: -0.5,
    marginBottom: 8,
  },
  heroSubtitle: {
    fontSize: 16,
    color: 'rgba(255,255,255,0.55)',
    textAlign: 'center',
    lineHeight: 22,
    paddingHorizontal: 8,
  },

  // Features
  features: {
    gap: 16,
    marginBottom: 28,
  },
  featureRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 14,
  },
  featureIcon: {
    width: 36,
    height: 36,
    borderRadius: 10,
    alignItems: 'center',
    justifyContent: 'center',
  },
  featureText: {
    flex: 1,
  },
  featureTitle: {
    fontSize: 16,
    fontWeight: '600',
    color: '#fff',
  },
  featureDesc: {
    fontSize: 13,
    color: 'rgba(255,255,255,0.5)',
    marginTop: 1,
  },

  // Price card
  priceCard: {
    backgroundColor: 'rgba(255,255,255,0.06)',
    borderWidth: 1,
    borderColor: 'rgba(62,235,190,0.3)',
    borderRadius: 16,
    padding: 20,
    alignItems: 'center',
    marginBottom: 20,
  },
  priceLabel: {
    fontSize: 12,
    fontWeight: '600',
    color: 'rgba(255,255,255,0.5)',
    textTransform: 'uppercase',
    letterSpacing: 1,
    marginBottom: 6,
  },
  priceRow: {
    flexDirection: 'row',
    alignItems: 'baseline',
  },
  priceAmount: {
    fontSize: 36,
    fontWeight: '700',
    color: '#fff',
  },
  pricePeriod: {
    fontSize: 16,
    color: 'rgba(255,255,255,0.5)',
    marginLeft: 4,
  },
  priceNote: {
    fontSize: 13,
    color: 'rgba(255,255,255,0.4)',
    marginTop: 8,
  },

  // Error
  errorBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    backgroundColor: 'rgba(220,38,38,0.1)',
    borderWidth: 1,
    borderColor: 'rgba(220,38,38,0.3)',
    borderRadius: 12,
    padding: 12,
    marginBottom: 16,
  },
  errorText: {
    flex: 1,
    fontSize: 14,
    color: '#f87171',
  },

  // CTA
  ctaBtn: {
    paddingVertical: 16,
    borderRadius: 12,
    alignItems: 'center',
  },
  ctaDisabled: {
    opacity: 0.5,
  },
  ctaText: {
    fontSize: 17,
    fontWeight: '600',
    color: '#fff',
  },

  // Restore
  restoreBtn: {
    alignItems: 'center',
    paddingVertical: 16,
  },
  restoreText: {
    fontSize: 15,
    color: 'rgba(255,255,255,0.5)',
  },

  // Legal
  legal: {
    fontSize: 11,
    color: 'rgba(255,255,255,0.25)',
    textAlign: 'center',
    lineHeight: 16,
    marginTop: 4,
  },
  legalLinks: {
    flexDirection: 'row',
    justifyContent: 'center',
    alignItems: 'center',
    gap: 8,
    marginTop: 12,
  },
  legalLink: {
    fontSize: 12,
    color: 'rgba(255,255,255,0.4)',
    textDecorationLine: 'underline',
  },
  legalSeparator: {
    fontSize: 12,
    color: 'rgba(255,255,255,0.25)',
  },
});
