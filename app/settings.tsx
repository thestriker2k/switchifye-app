import { useEffect, useState, useCallback, useRef } from 'react';
import {
  StyleSheet,
  View,
  Text,
  Alert,
  SafeAreaView,
  TouchableOpacity,
  Switch,
  Linking,
  ActivityIndicator,
  ScrollView,
  TextInput,
} from 'react-native';
import { useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import { webViewRef } from './index';
import { supabase, SUPABASE_URL, SUPABASE_ANON_KEY } from '../lib/supabase';
import { useGuest } from './_layout';

const APP_URL = 'https://app.switchifye.com';

const PLAN_NAMES: Record<string, string> = {
  free: 'Free',
  starter: 'Premium',
  premium: 'Premium',
  pro: 'Pro',
  enterprise: 'Enterprise',
};

export default function SettingsScreen() {
  const router = useRouter();
  const { isGuest, setIsGuest } = useGuest();
  const navigatingRef = useRef(false);
  const [email, setEmail] = useState<string | null>(null);
  const [reminderEnabled, setReminderEnabled] = useState(true);
  const [reminderLoading, setReminderLoading] = useState(false);
  const [loading, setLoading] = useState(true);
  const [deleteLoading, setDeleteLoading] = useState(false);
  const [planName, setPlanName] = useState('Free');
  const [planId, setPlanId] = useState('free');
  const [periodEnd, setPeriodEnd] = useState<string | null>(null);
  const [cancelAtPeriodEnd, setCancelAtPeriodEnd] = useState(false);
  const [firstName, setFirstName] = useState('');
  const [lastName, setLastName] = useState('');
  const [nameLoading, setNameLoading] = useState(false);
  const [nameDirty, setNameDirty] = useState(false);

  const fetchUserData = useCallback(async () => {
    try {
      const { data: sessionData } = await supabase.auth.getSession();
      const session = sessionData.session;
      if (!session) return;

      setEmail(session.user.email ?? null);

      // Fetch reminder_enabled from user_settings
      const settingsRes = await fetch(
        `${SUPABASE_URL}/rest/v1/user_settings?user_id=eq.${session.user.id}&select=reminder_enabled,first_name,last_name`,
        {
          headers: {
            Authorization: `Bearer ${session.access_token}`,
            apikey: SUPABASE_ANON_KEY,
          },
        }
      );
      if (settingsRes.ok) {
        const rows = await settingsRes.json();
        if (rows.length > 0 && rows[0].reminder_enabled !== undefined) {
          setReminderEnabled(rows[0].reminder_enabled);
        }
        if (rows.length > 0) {
          setFirstName(rows[0].first_name ?? '');
          setLastName(rows[0].last_name ?? '');
        }
      }

      // Fetch subscription
      const subRes = await fetch(
        `${SUPABASE_URL}/rest/v1/subscriptions?user_id=eq.${session.user.id}&status=in.(active,grace_period,billing_retry)&select=plan_id,status,current_period_end,cancel_at_period_end,platform`,
        {
          headers: {
            Authorization: `Bearer ${session.access_token}`,
            apikey: SUPABASE_ANON_KEY,
          },
        }
      );
      if (subRes.ok) {
        const subRows = await subRes.json();
        if (subRows.length > 0) {
          const sub = subRows[0];
          const id = sub.plan_id || 'free';
          setPlanId(id);
          setPlanName(PLAN_NAMES[id] || id);
          setPeriodEnd(sub.current_period_end || null);
          setCancelAtPeriodEnd(sub.cancel_at_period_end || false);
        }
      }
    } catch (err) {
      console.error('Failed to fetch user data:', err);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchUserData();
  }, [fetchUserData]);

  const handleToggleReminder = async (value: boolean) => {
    setReminderEnabled(value);
    setReminderLoading(true);

    try {
      const { data: sessionData } = await supabase.auth.getSession();
      const session = sessionData.session;
      if (!session) throw new Error('Not authenticated');

      const res = await fetch(
        `${SUPABASE_URL}/rest/v1/user_settings?user_id=eq.${session.user.id}`,
        {
          method: 'PATCH',
          headers: {
            Authorization: `Bearer ${session.access_token}`,
            apikey: SUPABASE_ANON_KEY,
            'Content-Type': 'application/json',
            Prefer: 'return=minimal',
          },
          body: JSON.stringify({ reminder_enabled: value }),
        }
      );

      if (!res.ok) {
        throw new Error(`Failed to update: ${res.status}`);
      }
    } catch (err: any) {
      console.error('Failed to update reminder setting:', err);
      setReminderEnabled(!value);
      Alert.alert('Error', 'Failed to update reminder setting.');
    } finally {
      setReminderLoading(false);
    }
  };

  const handleSaveName = async () => {
    setNameLoading(true);
    try {
      const { data: sessionData } = await supabase.auth.getSession();
      const session = sessionData.session;
      if (!session) throw new Error('Not authenticated');

      const res = await fetch(
        `${SUPABASE_URL}/rest/v1/user_settings?user_id=eq.${session.user.id}`,
        {
          method: 'PATCH',
          headers: {
            Authorization: `Bearer ${session.access_token}`,
            apikey: SUPABASE_ANON_KEY,
            'Content-Type': 'application/json',
            Prefer: 'return=minimal',
          },
          body: JSON.stringify({
            first_name: firstName.trim() || null,
            last_name: lastName.trim() || null,
          }),
        }
      );

      if (!res.ok) {
        throw new Error(`Failed to update: ${res.status}`);
      }

      setNameDirty(false);
      Alert.alert('Saved', 'Your name has been updated.');
    } catch (err: any) {
      console.error('Failed to update name:', err);
      Alert.alert('Error', 'Failed to update name.');
    } finally {
      setNameLoading(false);
    }
  };

  const handleLogOut = () => {
    Alert.alert('Log Out', 'Are you sure you want to log out?', [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Log Out',
        style: 'destructive',
        onPress: async () => {
          // Clear WebView session
          webViewRef.current?.injectJavaScript(`
            (function() {
              Object.keys(localStorage).forEach(function(key) {
                if (key.startsWith('sb-')) localStorage.removeItem(key);
              });
            })();
            true;
          `);
          // Sign out native client (clears AsyncStorage session)
          await supabase.auth.signOut();
          // _layout.tsx auth listener will redirect to /login
        },
      },
    ]);
  };

  const handleDeleteAccount = () => {
    Alert.alert(
      'Delete Account',
      'This will permanently delete your account and all your data. This cannot be undone.',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Delete Account',
          style: 'destructive',
          onPress: async () => {
            setDeleteLoading(true);
            try {
              const { data: sessionData } = await supabase.auth.getSession();
              const token = sessionData.session?.access_token;
              if (!token) throw new Error('Not authenticated');

              const res = await fetch(`${APP_URL}/api/account/delete`, {
                method: 'DELETE',
                headers: {
                  Authorization: `Bearer ${token}`,
                  'Content-Type': 'application/json',
                },
              });

              if (!res.ok) {
                const data = await res.json().catch(() => ({}));
                throw new Error(data.error || `Failed: ${res.status}`);
              }

              // Clear WebView session
              webViewRef.current?.injectJavaScript(`
                (function() {
                  Object.keys(localStorage).forEach(function(key) {
                    if (key.startsWith('sb-')) localStorage.removeItem(key);
                  });
                })();
                true;
              `);
              await supabase.auth.signOut();
              // _layout.tsx auth listener will redirect to /login
            } catch (err: any) {
              console.error('Account deletion error:', err);
              Alert.alert('Error', err.message || 'Failed to delete account.');
            } finally {
              setDeleteLoading(false);
            }
          },
        },
      ]
    );
  };

  const formatDate = (iso: string) => {
    const d = new Date(iso);
    return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
  };

  const isPaid = planId !== 'free';

  if (isGuest) {
    return (
      <SafeAreaView style={styles.safeArea}>
        <View style={styles.header}>
          <TouchableOpacity onPress={() => router.back()} style={styles.backButton}>
            <Ionicons name="chevron-back" size={24} color="#111827" />
          </TouchableOpacity>
          <Text style={styles.headerTitle}>Settings</Text>
          <View style={{ width: 38 }} />
        </View>
        <View style={styles.guestContainer}>
          <Ionicons name="lock-closed-outline" size={48} color="#9ca3af" />
          <Text style={styles.guestTitle}>Sign up to access settings</Text>
          <TouchableOpacity
            onPress={() => {
              setIsGuest(false);
              router.replace('/login');
            }}
            activeOpacity={0.8}
          >
            <LinearGradient
              colors={['#4A9FF5', '#3EEBBE']}
              start={{ x: 0, y: 0 }}
              end={{ x: 1, y: 0 }}
              style={styles.guestCta}
            >
              <Text style={styles.guestCtaText}>Create Free Account</Text>
            </LinearGradient>
          </TouchableOpacity>
        </View>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={styles.safeArea}>
      {/* Native header */}
      <View style={styles.header}>
        <TouchableOpacity onPress={() => router.back()} style={styles.backButton}>
          <Ionicons name="chevron-back" size={24} color="#111827" />
        </TouchableOpacity>
        <Text style={styles.headerTitle}>Settings</Text>
        <View style={{ width: 38 }} />
      </View>

      <ScrollView style={styles.scrollView}>
        {/* Account section */}
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>ACCOUNT</Text>
          <View style={styles.card}>
            <View style={styles.row}>
              <Text style={styles.rowLabel}>Email</Text>
              {loading ? (
                <ActivityIndicator size="small" color="#9ca3af" />
              ) : (
                <Text style={styles.rowValue}>{email ?? '—'}</Text>
              )}
            </View>
            <View style={styles.separator} />
            <View style={styles.row}>
              <Text style={styles.rowLabel}>First Name</Text>
              <TextInput
                style={styles.nameInput}
                value={firstName}
                onChangeText={(text) => { setFirstName(text); setNameDirty(true); }}
                placeholder="Optional"
                placeholderTextColor="#9ca3af"
                autoCapitalize="words"
                autoCorrect={false}
              />
            </View>
            <View style={styles.separator} />
            <View style={styles.row}>
              <Text style={styles.rowLabel}>Last Name</Text>
              <TextInput
                style={styles.nameInput}
                value={lastName}
                onChangeText={(text) => { setLastName(text); setNameDirty(true); }}
                placeholder="Optional"
                placeholderTextColor="#9ca3af"
                autoCapitalize="words"
                autoCorrect={false}
              />
            </View>
            {nameDirty && (
              <>
                <View style={styles.separator} />
                <TouchableOpacity
                  style={styles.saveNameButton}
                  onPress={handleSaveName}
                  disabled={nameLoading}
                  activeOpacity={0.7}
                >
                  {nameLoading ? (
                    <ActivityIndicator size="small" color="#fff" />
                  ) : (
                    <Text style={styles.saveNameText}>Save Name</Text>
                  )}
                </TouchableOpacity>
              </>
            )}
          </View>
        </View>

        {/* Subscription section */}
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>SUBSCRIPTION</Text>
          <View style={styles.card}>
            <View style={styles.row}>
              <Text style={styles.rowLabel}>Current Plan</Text>
              {loading ? (
                <ActivityIndicator size="small" color="#9ca3af" />
              ) : (
                <View style={styles.planRight}>
                  <Text style={[styles.planBadge, isPaid ? styles.planPaid : styles.planFree]}>
                    {planName}
                  </Text>
                  {isPaid && periodEnd && (
                    <Text style={styles.renewText}>
                      {cancelAtPeriodEnd ? 'Expires' : 'Renews'} {formatDate(periodEnd)}
                    </Text>
                  )}
                </View>
              )}
            </View>
            {!loading && (
              <>
                <View style={styles.separator} />
                {isPaid ? (
                  <TouchableOpacity
                    style={styles.row}
                    onPress={() => Linking.openURL('https://apps.apple.com/account/subscriptions')}
                    activeOpacity={0.7}
                  >
                    <Text style={styles.rowLabel}>Manage Subscription</Text>
                    <Ionicons name="chevron-forward" size={18} color="#9ca3af" />
                  </TouchableOpacity>
                ) : (
                  <TouchableOpacity
                    style={styles.row}
                    onPress={() => {
                      if (navigatingRef.current) return;
                      navigatingRef.current = true;
                      router.push('/paywall');
                      setTimeout(() => { navigatingRef.current = false; }, 1000);
                    }}
                    activeOpacity={0.7}
                  >
                    <Text style={styles.upgradeLabel}>Upgrade to Premium</Text>
                    <Ionicons name="chevron-forward" size={18} color="#3EEBBE" />
                  </TouchableOpacity>
                )}
              </>
            )}
          </View>
        </View>

        {/* Notifications section */}
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>NOTIFICATIONS</Text>
          <View style={styles.card}>
            <View style={styles.row}>
              <View style={styles.rowLeft}>
                <Text style={styles.rowLabel}>Email Reminders</Text>
                <Text style={styles.rowSub}>Get reminded before switches trigger</Text>
              </View>
              {loading ? (
                <ActivityIndicator size="small" color="#9ca3af" />
              ) : (
                <Switch
                  value={reminderEnabled}
                  onValueChange={handleToggleReminder}
                  disabled={reminderLoading}
                  trackColor={{ false: '#d1d5db', true: '#3EEBBE' }}
                  thumbColor="#fff"
                />
              )}
            </View>
            <View style={styles.separator} />
            <TouchableOpacity
              style={styles.row}
              onPress={() => Linking.openURL('app-settings:')}
              activeOpacity={0.7}
            >
              <View style={styles.rowLeft}>
                <Text style={styles.rowLabel}>Push Notifications</Text>
                <Text style={styles.rowSub}>Manage in iPhone Settings</Text>
              </View>
              <Ionicons name="chevron-forward" size={18} color="#9ca3af" />
            </TouchableOpacity>
          </View>
        </View>

        {/* Actions section */}
        <View style={styles.section}>
          <View style={styles.card}>
            <TouchableOpacity style={styles.row} onPress={handleLogOut}>
              <Text style={styles.rowLabel}>Log Out</Text>
              <Ionicons name="chevron-forward" size={18} color="#9ca3af" />
            </TouchableOpacity>
          </View>
        </View>

        <View style={styles.section}>
          <View style={styles.card}>
            <TouchableOpacity
              style={styles.row}
              onPress={handleDeleteAccount}
              disabled={deleteLoading}
            >
              {deleteLoading ? (
                <ActivityIndicator size="small" color="#dc2626" />
              ) : (
                <Text style={styles.destructiveLabel}>Delete Account</Text>
              )}
            </TouchableOpacity>
          </View>
        </View>

        <Text style={styles.version}>Switchifye v1.0.1</Text>
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safeArea: {
    flex: 1,
    backgroundColor: '#f3f4f6',
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 12,
    paddingVertical: 12,
    backgroundColor: '#fff',
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: '#e5e7eb',
  },
  backButton: {
    width: 38,
    height: 38,
    justifyContent: 'center',
    alignItems: 'center',
  },
  headerTitle: {
    fontSize: 17,
    fontWeight: '600',
    color: '#111827',
  },
  scrollView: {
    flex: 1,
  },
  section: {
    paddingHorizontal: 16,
    marginTop: 24,
  },
  sectionTitle: {
    fontSize: 12,
    fontWeight: '600',
    color: '#6b7280',
    letterSpacing: 0.5,
    marginBottom: 8,
    marginLeft: 4,
  },
  card: {
    backgroundColor: '#fff',
    borderRadius: 12,
    overflow: 'hidden',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.05,
    shadowRadius: 2,
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingVertical: 14,
  },
  rowLeft: {
    flex: 1,
    marginRight: 12,
  },
  rowLabel: {
    fontSize: 17,
    color: '#111827',
  },
  rowValue: {
    fontSize: 15,
    color: '#6b7280',
    flexShrink: 1,
  },
  rowSub: {
    fontSize: 13,
    color: '#6b7280',
    marginTop: 2,
  },
  separator: {
    height: StyleSheet.hairlineWidth,
    backgroundColor: '#e5e7eb',
    marginLeft: 16,
  },
  planRight: {
    alignItems: 'flex-end',
  },
  planBadge: {
    fontSize: 15,
    fontWeight: '600',
  },
  planPaid: {
    color: '#3EEBBE',
  },
  planFree: {
    color: '#6b7280',
  },
  renewText: {
    fontSize: 12,
    color: '#9ca3af',
    marginTop: 2,
  },
  upgradeLabel: {
    fontSize: 17,
    fontWeight: '600',
    color: '#3EEBBE',
  },
  nameInput: {
    fontSize: 15,
    color: '#111827',
    textAlign: 'right',
    flex: 1,
    marginLeft: 12,
    paddingVertical: 0,
  },
  saveNameButton: {
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 14,
  },
  saveNameText: {
    fontSize: 17,
    fontWeight: '600',
    color: '#4A9FF5',
  },
  destructiveLabel: {
    fontSize: 17,
    color: '#dc2626',
  },
  version: {
    textAlign: 'center',
    color: '#9ca3af',
    fontSize: 13,
    marginTop: 24,
    marginBottom: 32,
  },
  guestContainer: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 32,
  },
  guestTitle: {
    fontSize: 18,
    fontWeight: '600',
    color: '#6b7280',
    marginTop: 16,
    marginBottom: 24,
  },
  guestCta: {
    paddingVertical: 16,
    paddingHorizontal: 48,
    borderRadius: 12,
    alignItems: 'center',
  },
  guestCtaText: {
    fontSize: 17,
    fontWeight: '600',
    color: '#fff',
  },
});
