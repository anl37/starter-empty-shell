import { useState, useEffect, useCallback } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from './useAuth';
import { GeolocationData } from './useGeolocation';
import { distanceMeters, generatePairId, getGeohashNeighbors, toGeohash } from '@/lib/geo';
import { getCommonInterests } from '@/config/interests';
import { FEATURE_FLAGS } from '@/config/featureFlags';

export interface NearbyUser {
  id: string;
  name: string;
  interests: string[];
  lat: number;
  lng: number;
  distance: number;
  sharedInterests: string[];
  emoji_signature?: string;
  avatar_url?: string;
}

interface UseNearbyMatchesOptions {
  location: GeolocationData | null;
  enabled: boolean;
}

/**
 * Hook to find and match with nearby users
 * - Queries by geohash for efficiency
 * - Filters by distance (≤100m default)
 * - Requires ≥1 shared interest
 * - Auto-creates matches when criteria met
 */
export const useNearbyMatches = ({ location, enabled }: UseNearbyMatchesOptions) => {
  const { user } = useAuth();
  const [nearbyUsers, setNearbyUsers] = useState<NearbyUser[]>([]);
  const [loading, setLoading] = useState(false);
  const [myInterests, setMyInterests] = useState<string[]>([]);

  // Load user's own interests
  useEffect(() => {
    if (!user) return;

    const loadMyInterests = async () => {
      const { data, error } = await supabase
        .from('profiles')
        .select('interests')
        .eq('id', user.id)
        .single();

      if (!error && data) {
        setMyInterests(data.interests || []);
      }
    };

    loadMyInterests();
  }, [user]);

  // Auto-create match when users are near with shared interests
  const createMatchIfNeeded = useCallback(async (otherUserId: string, sharedInterests: string[]) => {
    if (!user || sharedInterests.length === 0) return;

    const pairId = generatePairId(user.id, otherUserId);
    const [uidA, uidB] = [user.id, otherUserId].sort();

    try {
      // Check if match already exists
      const { data: existing } = await supabase
        .from('matches')
        .select('id, status')
        .eq('pair_id', pairId)
        .maybeSingle();

      if (existing) {
        // Update last_seen_together_at
        await supabase
          .from('matches')
          .update({ last_seen_together_at: new Date().toISOString() })
          .eq('id', existing.id);

        if (FEATURE_FLAGS.debugPresenceLogging) {
          console.log('[Match] Updated existing match:', pairId);
        }
      } else {
        // Create new match
        const { error } = await supabase
          .from('matches')
          .insert({
            pair_id: pairId,
            uid_a: uidA,
            uid_b: uidB,
            shared_interests: sharedInterests,
            status: 'suggested',
          });

        if (error) {
          console.error('[Match] Error creating match:', error);
        } else if (FEATURE_FLAGS.debugPresenceLogging) {
          console.log('[Match] Created new match:', pairId, sharedInterests);
        }
      }
    } catch (error) {
      console.error('[Match] Unexpected error:', error);
    }
  }, [user]);

  // Query nearby users
  const queryNearby = useCallback(async () => {
    if (!location || !user || !enabled || myInterests.length === 0) {
      setNearbyUsers([]);
      return;
    }

    setLoading(true);
    try {
      // Calculate geohash from current location coordinates (use precision 6 for 100m matching)
      const myGeohash = toGeohash(location.lat, location.lng, 6);
      const neighbors = getGeohashNeighbors(myGeohash);

      // Query profiles with nearby geohash
      const { data: profiles, error } = await supabase
        .from('profiles')
        .select('id, name, interests, lat, lng, geohash, emoji_signature, avatar_url, is_visible, onboarded')
        .neq('id', user.id) // Exclude self
        .eq('is_visible', true)
        .eq('onboarded', true)
        .in('geohash', neighbors);

      if (error) {
        console.error('[Nearby] Query error:', error);
        return;
      }

      if (!profiles || profiles.length === 0) {
        setNearbyUsers([]);
        return;
      }

      // Filter by precise distance and shared interests
      const nearby: NearbyUser[] = [];

      for (const profile of profiles) {
        if (!profile.lat || !profile.lng || !profile.interests) continue;

        // Calculate exact distance
        const distance = distanceMeters(location.lat, location.lng, profile.lat, profile.lng);

        // Must be within maxMatchDistanceMeters
        if (distance > FEATURE_FLAGS.maxMatchDistanceMeters) {
          continue;
        }

        // Must share at least 1 interest
        const sharedInterests = getCommonInterests(myInterests, profile.interests);
        if (sharedInterests.length === 0) {
          continue;
        }

        nearby.push({
          id: profile.id,
          name: profile.name,
          interests: profile.interests,
          lat: profile.lat,
          lng: profile.lng,
          distance,
          sharedInterests,
          emoji_signature: profile.emoji_signature || undefined,
          avatar_url: profile.avatar_url || undefined,
        });

        // Auto-create match
        await createMatchIfNeeded(profile.id, sharedInterests);
      }

      // Sort by distance
      nearby.sort((a, b) => a.distance - b.distance);

      setNearbyUsers(nearby);

      if (FEATURE_FLAGS.debugPresenceLogging) {
        console.log('[Nearby] Found users:', nearby.length, {
          maxDistance: FEATURE_FLAGS.maxMatchDistanceMeters,
          myLocation: { lat: location.lat.toFixed(5), lng: location.lng.toFixed(5) },
        });
      }
    } catch (error) {
      console.error('[Nearby] Unexpected error:', error);
    } finally {
      setLoading(false);
    }
  }, [location, user, enabled, myInterests, createMatchIfNeeded]);

  // Query on location change
  useEffect(() => {
    queryNearby();

    // Refresh every 30 seconds
    const interval = setInterval(queryNearby, 30000);

    return () => clearInterval(interval);
  }, [queryNearby]);

  // Subscribe to presence changes for real-time updates
  useEffect(() => {
    if (!enabled || !user) return;

    const channel = supabase
      .channel('presence-changes')
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'presence',
        },
        () => {
          // Refetch nearby users when presence changes
          queryNearby();
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [enabled, user, queryNearby]);

  return {
    nearbyUsers,
    loading,
    refetch: queryNearby,
  };
};
