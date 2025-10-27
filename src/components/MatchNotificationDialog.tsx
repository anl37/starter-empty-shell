import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { useMatchNotifications } from "@/hooks/useMatchNotifications";
import { IcebreakerScreen } from "@/components/IcebreakerScreen";
import { Sparkles } from "lucide-react";
import { useState, useEffect, useRef } from "react";
import { supabase } from "@/integrations/supabase/client";

interface MeetingDetails {
  sharedEmojiCode: string;
  venueName: string;
  landmark: string;
  meetCode: string;
}

export const MatchNotificationDialog = () => {
  const { newMatch, clearMatch } = useMatchNotifications();
  const [showIcebreaker, setShowIcebreaker] = useState(false);
  const [meetingDetails, setMeetingDetails] = useState<MeetingDetails | null>(null);
  const lastMatchId = useRef<string | null>(null);

  // Load meeting details from database
  useEffect(() => {
    if (newMatch && newMatch.matchId !== lastMatchId.current) {
      lastMatchId.current = newMatch.matchId;
      
      const loadMeetingDetails = async () => {
        const { data, error } = await supabase
          .from('matches')
          .select('venue_name, landmark, meet_code, shared_emoji_code')
          .eq('id', newMatch.matchId)
          .single();
        
        if (error) {
          console.error('[MatchNotification] Error loading meeting details:', error);
          return;
        }
        
        if (data) {
          setMeetingDetails({
            sharedEmojiCode: data.shared_emoji_code || '🎉🎊',
            venueName: data.venue_name || 'Current location',
            landmark: data.landmark || 'Main entrance',
            meetCode: data.meet_code || 'MEET0000'
          });
        }
      };
      
      loadMeetingDetails();
    }
  }, [newMatch]);

  const handleContinue = () => {
    setShowIcebreaker(true);
  };

  if (!newMatch || !meetingDetails) return null;

  return (
    <>
    <Dialog open={!!newMatch && !showIcebreaker} onOpenChange={(open) => !open && clearMatch()}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2 justify-center text-2xl">
            <Sparkles className="w-6 h-6 text-success" />
            It's a Match!
            <Sparkles className="w-6 h-6 text-success" />
          </DialogTitle>
        </DialogHeader>

        <div className="space-y-6 py-4">
          <div className="text-center">
            <div className="w-24 h-24 mx-auto mb-4 rounded-full bg-gradient-warm flex items-center justify-center text-5xl shadow-glow animate-bounce">
              🎉
            </div>
            <p className="text-lg font-semibold mb-2">
              You're now connected with {newMatch.matchedUserName}!
            </p>
            <p className="text-sm text-muted-foreground">
              You can now start planning meetups together
            </p>
          </div>

          <Button
            onClick={handleContinue}
            className="w-full gradient-warm shadow-soft hover:shadow-glow transition-all"
          >
            Let's Meet!
          </Button>
        </div>
      </DialogContent>
    </Dialog>

    <IcebreakerScreen
      open={showIcebreaker}
      onClose={() => {
        setShowIcebreaker(false);
        clearMatch();
        lastMatchId.current = null;
        setMeetingDetails(null);
      }}
      userName={newMatch.matchedUserName}
      meetCode={meetingDetails.meetCode}
      sharedEmojiCode={meetingDetails.sharedEmojiCode}
      venueName={meetingDetails.venueName}
      landmark={meetingDetails.landmark}
    />
  </>
  );
};
