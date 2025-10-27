import { useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "./useAuth";
import { toast } from "sonner";

export const useConnectionRequest = () => {
  const { user } = useAuth();
  const [isLoading, setIsLoading] = useState(false);

  const sendConnectionRequest = async (receiverId: string, receiverName: string) => {
    if (!user?.id) {
      toast.error("You must be logged in to connect");
      return { success: false };
    }

    if (user.id === receiverId) {
      toast.error("You cannot connect with yourself");
      return { success: false };
    }

    setIsLoading(true);
    try {
      // Check if already connected or request exists
      const pairId = [user.id, receiverId].sort().join('_');
      
      const { data: existingMatch } = await supabase
        .from('matches')
        .select('id, status')
        .eq('pair_id', pairId)
        .maybeSingle();

      if (existingMatch && existingMatch.status === 'connected') {
        toast.error("You're already connected with this person");
        return { success: false };
      }

      const { data: existingRequest } = await supabase
        .from('connection_requests')
        .select('id, status')
        .eq('sender_id', user.id)
        .eq('receiver_id', receiverId)
        .in('status', ['pending'])
        .maybeSingle();

      if (existingRequest) {
        toast.error("Connection request already sent");
        return { success: false };
      }

      // Check if receiver has auto-accept enabled
      const { data: receiverProfile, error: profileError } = await supabase
        .from('profiles')
        .select('auto_accept_connections, name')
        .eq('id', receiverId)
        .maybeSingle();

      if (profileError) {
        console.error('Error fetching receiver profile:', profileError);
        toast.error("Failed to check receiver preferences");
        return { success: false };
      }

      if (!receiverProfile) {
        toast.error("Receiver profile not found");
        return { success: false };
      }

      console.log('Receiver auto_accept_connections:', receiverProfile.auto_accept_connections);

      // Explicitly check if auto-accept is enabled (must be true, not null or false)
      if (receiverProfile.auto_accept_connections === true) {
        // Auto-accept: Create match directly
        const pairId = [user.id, receiverId].sort().join('_');
        
        const { error: matchError } = await supabase
          .from('matches')
          .insert({
            uid_a: user.id < receiverId ? user.id : receiverId,
            uid_b: user.id < receiverId ? receiverId : user.id,
            pair_id: pairId,
            status: 'connected'
          });

        if (matchError) {
          if (matchError.code === '23505') {
            toast.error("You're already connected with this person");
          } else {
            toast.error("Failed to create connection");
          }
          return { success: false };
        }

        toast.success(`You're now connected with ${receiverName}!`);
        return { success: true, autoAccepted: true };
      } else {
        // Manual mode: Create connection request
        const { error: requestError } = await supabase
          .from('connection_requests')
          .insert({
            sender_id: user.id,
            receiver_id: receiverId,
            status: 'pending'
          });

        if (requestError) {
          if (requestError.code === '23505') {
            toast.error("Connection request already sent");
          } else {
            toast.error("Failed to send connection request");
          }
          return { success: false };
        }

        toast.success(`Connection request sent to ${receiverName}`);
        return { success: true, autoAccepted: false };
      }
    } catch (error) {
      console.error('Error sending connection request:', error);
      toast.error("Failed to connect");
      return { success: false };
    } finally {
      setIsLoading(false);
    }
  };

  const acceptConnectionRequest = async (requestId: string, senderId: string) => {
    if (!user?.id) return { success: false };

    setIsLoading(true);
    try {
      // Create match
      const pairId = [user.id, senderId].sort().join('_');
      
      // Check if match already exists
      const { data: existingMatch } = await supabase
        .from('matches')
        .select('id, status')
        .eq('pair_id', pairId)
        .maybeSingle();

      if (existingMatch) {
        // Update existing match to connected
        const { error: updateMatchError } = await supabase
          .from('matches')
          .update({ status: 'connected' })
          .eq('id', existingMatch.id);

        if (updateMatchError) {
          console.error('Error updating existing match:', updateMatchError);
          toast.error("Failed to update connection");
          return { success: false };
        }
      } else {
        // Create new match
        const { error: matchError } = await supabase
          .from('matches')
          .insert({
            uid_a: user.id < senderId ? user.id : senderId,
            uid_b: user.id < senderId ? senderId : user.id,
            pair_id: pairId,
            status: 'connected'
          });

        if (matchError) {
          console.error('Error creating match:', matchError);
          toast.error(`Failed to create connection: ${matchError.message}`);
          return { success: false };
        }
      }

      // Update request status
      const { error: updateError } = await supabase
        .from('connection_requests')
        .update({ status: 'accepted', updated_at: new Date().toISOString() })
        .eq('id', requestId);

      if (updateError) {
        console.error('Error updating request status:', updateError);
      }

      toast.success("Connection accepted!");
      return { success: true };
    } catch (error) {
      console.error('Error accepting connection request:', error);
      toast.error("Failed to accept connection");
      return { success: false };
    } finally {
      setIsLoading(false);
    }
  };

  const rejectConnectionRequest = async (requestId: string) => {
    if (!user?.id) return { success: false };

    setIsLoading(true);
    try {
      const { error } = await supabase
        .from('connection_requests')
        .update({ status: 'rejected', updated_at: new Date().toISOString() })
        .eq('id', requestId);

      if (error) {
        toast.error("Failed to reject connection");
        return { success: false };
      }

      toast.success("Connection request rejected");
      return { success: true };
    } catch (error) {
      console.error('Error rejecting connection request:', error);
      toast.error("Failed to reject connection");
      return { success: false };
    } finally {
      setIsLoading(false);
    }
  };

  return {
    sendConnectionRequest,
    acceptConnectionRequest,
    rejectConnectionRequest,
    isLoading
  };
};
