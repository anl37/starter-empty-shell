import { useEffect, useState } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { useConnectionRequest } from "@/hooks/useConnectionRequest";
import { useIncomingConnectionRequests } from "@/hooks/useIncomingConnectionRequests";
import { useMatchNotifications } from "@/hooks/useMatchNotifications";
import { IcebreakerScreen } from "@/components/IcebreakerScreen";
import { supabase } from "@/integrations/supabase/client";

export const IncomingConnectionRequestDialog = () => {
  const { currentRequest, removeRequest } = useIncomingConnectionRequests();
  const { acceptConnectionRequest, rejectConnectionRequest, isLoading } = useConnectionRequest();
  const { suppressNotificationForAcceptedRequest } = useMatchNotifications();
  const [open, setOpen] = useState(false);
  const [showIcebreaker, setShowIcebreaker] = useState(false);
  const [meetingDetails, setMeetingDetails] = useState<any>(null);

  // Only show dialog for manual acceptance (auto-accept is handled when request is sent)
  useEffect(() => {
    if (!currentRequest) return;
    // Show dialog for manual acceptance
    setOpen(true);
  }, [currentRequest]);

  const handleAccept = async () => {
    if (!currentRequest) return;

    // Close dialog immediately
    setOpen(false);
    
    const result = await acceptConnectionRequest(currentRequest.id, currentRequest.sender_id);
    
    if (result.success) {
      removeRequest(currentRequest.id);
      
      // Get the match details and show icebreaker directly
      const { data: matches } = await supabase
        .from('matches')
        .select('id, venue_name, landmark, meet_code, shared_emoji_code')
        .or(`uid_a.eq.${currentRequest.sender_id},uid_b.eq.${currentRequest.sender_id}`)
        .eq('status', 'connected')
        .order('created_at', { ascending: false })
        .limit(1);
      
      if (matches && matches.length > 0) {
        const match = matches[0];
        
        // Suppress match notification for this match
        suppressNotificationForAcceptedRequest(match.id);
        
        // Show icebreaker directly
        setMeetingDetails({
          sharedEmojiCode: match.shared_emoji_code || '🎉🎊',
          venueName: match.venue_name || 'Current location',
          landmark: match.landmark || 'Main entrance',
          meetCode: match.meet_code || 'MEET0000'
        });
        setShowIcebreaker(true);
      }
    } else {
      // Reopen if failed
      setOpen(true);
    }
  };

  const handleReject = async () => {
    if (!currentRequest) return;

    const result = await rejectConnectionRequest(currentRequest.id);
    
    if (result.success) {
      setOpen(false);
      removeRequest(currentRequest.id);
    }
  };

  if (!currentRequest && !showIcebreaker) {
    return null;
  }

  return (
    <>
    <Dialog open={open} onOpenChange={(isOpen) => {
      if (!isOpen) {
        setOpen(false);
        if (currentRequest) {
          removeRequest(currentRequest.id);
        }
      }
    }}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>Connection Request</DialogTitle>
          <DialogDescription>
            {currentRequest.sender_name} wants to connect with you
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          <div className="text-center py-4">
            <div className="w-16 h-16 mx-auto mb-4 rounded-full bg-gradient-warm flex items-center justify-center text-3xl shadow-soft">
              👋
            </div>
            <p className="text-sm text-muted-foreground">
              Accept this connection request to start connecting!
            </p>
          </div>

          <div className="flex gap-2">
            <Button
              onClick={handleReject}
              disabled={isLoading}
              variant="outline"
              className="flex-1"
            >
              Reject
            </Button>
            <Button
              onClick={handleAccept}
              disabled={isLoading}
              className="flex-1 gradient-warm shadow-soft"
            >
              Accept
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>

    {showIcebreaker && meetingDetails && (
      <IcebreakerScreen
        open={showIcebreaker}
        onClose={() => {
          setShowIcebreaker(false);
          setMeetingDetails(null);
        }}
        userName={currentRequest?.sender_name || 'Someone'}
        meetCode={meetingDetails.meetCode}
        sharedEmojiCode={meetingDetails.sharedEmojiCode}
        venueName={meetingDetails.venueName}
        landmark={meetingDetails.landmark}
      />
    )}
    </>
  );
};
