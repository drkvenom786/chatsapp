import { useState, useEffect, useRef } from "react";
import { Button } from "@/components/ui/button";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { loadFirebase, startRingtone, stopRingtone, generateChatRoomId } from "@/lib/firebase";
import SlideUpAccept from "./SlideUpAccept";
import { createCloudflareCallSession } from "@/lib/cloudflareCalls";
import { Phone, PhoneOff,
  Volume2,
  Volume1, Video, VideoOff, Mic, MicOff } from "lucide-react";
import { toast } from "sonner";

interface GlobalCallManagerProps {
  currentUser: any;
}

const ICE_SERVERS = {
  iceServers: [
    { urls: ["stun:stun.cloudflare.com:3478", "stun:stun.l.google.com:19302", "stun:stun1.l.google.com:19302"] },
  ],
};

export default function GlobalCallManager({ currentUser }: GlobalCallManagerProps) {
  const [callState, setCallState] = useState<"idle" | "calling" | "incoming" | "active">("idle");
  const [callType, setCallType] = useState<"audio" | "video">("audio");
  const [callerInfo, setCallerInfo] = useState<{ uid: string; name: string; offer?: any; cfSessionId?: string; chatRoomId?: string; timestamp?: number } | null>(null);
  const autoDeclineTimerRef = useRef<NodeJS.Timeout | null>(null);
  const incomingStartTimeRef = useRef<number>(0);
  const recentlyDeclinedCalls = useRef<Set<string>>(new Set());
  const [isMicMuted, setIsMicMuted] = useState(false);
  const [isVideoDisabled, setIsVideoDisabled] = useState(false);
  const [callDuration, setCallDuration] = useState(0);
  const [isLoudSpeaker, setIsLoudSpeaker] = useState(true);

  const toggleSpeaker = () => {
    const nextVal = !isLoudSpeaker;
    setIsLoudSpeaker(nextVal);
    if (remoteAudioRef.current) {
      remoteAudioRef.current.volume = nextVal ? 1.0 : 0.25;
    }
    // Volume adjusted silently
  };

  const localVideoRef = useRef<HTMLVideoElement | null>(null);
  const remoteVideoRef = useRef<HTMLVideoElement | null>(null);
  const remoteAudioRef = useRef<HTMLAudioElement | null>(null);

  const localStreamRef = useRef<MediaStream | null>(null);
  const pcRef = useRef<RTCPeerConnection | null>(null);

  useEffect(() => {
    let timer: any = null;
    if (callState === "active") {
      timer = setInterval(() => {
        setCallDuration((prev) => prev + 1);
      }, 1000);
    } else {
      setCallDuration(0);
    }
    return () => {
      if (timer) clearInterval(timer);
    };
  }, [callState]);

  const formatDuration = (seconds: number) => {
    const mins = Math.floor(seconds / 60);
    const secs = seconds % 60;
    return `${mins.toString().padStart(2, "0")}:${secs.toString().padStart(2, "0")}`;
  };

  const callStateRef = useRef<"idle" | "calling" | "incoming" | "active">("idle");
  callStateRef.current = callState;
  const activeCallPathRef = useRef<string | null>(null);

  useEffect(() => {
    if (!currentUser?.uid) return;
    let unsubIncomingCall: any = null;
    let unsubUserCall: any = null;
    let unsubCall: any = null;
    let unsubChats: any = null;

    loadFirebase().then((runtime) => {
      if (!runtime) return;

      const processIncomingCall = async (val: any, pathKey: string, roomId?: string) => {
        if (val && val.status === "calling" && (val.target === currentUser.uid || !val.target)) {
          const callIdKey = `${val.from}_${val.timestamp || 0}`;
          if (recentlyDeclinedCalls.current.has(callIdKey)) {
            return;
          }
          try {
            const blocked = await runtime.dbFns.get(runtime.dbFns.ref(runtime.db, `users/${currentUser.uid}/blockedUsers/${val.from}`));
            if (blocked.val()) {
              await Promise.all([
                runtime.dbFns.remove(runtime.dbFns.ref(runtime.db, `calls/${currentUser.uid}`)),
                runtime.dbFns.remove(runtime.dbFns.ref(runtime.db, `chats/${val.chatRoomId || roomId || generateChatRoomId(val.from, currentUser.uid)}/call`)),
              ]);
              return;
            }
          } catch (error) {
            // The ring screen must not depend on this optional permission check.
            console.warn("Block list check skipped for incoming call:", error);
          }
          const callStart = val.timestamp || Date.now();
          const callAge = Date.now() - callStart;
          if (callAge > 60000) {
            // Already older than 1 minute: auto-log missed call with 60s and cleanup
            logCallHistory(val.from, currentUser.uid, val.type || "audio", "missed", 60, callStart).catch(() => {});
            try {
              await Promise.all([
                runtime.dbFns.remove(runtime.dbFns.ref(runtime.db, `calls/${currentUser.uid}`)),
                runtime.dbFns.remove(runtime.dbFns.ref(runtime.db, `users/${currentUser.uid}/incomingCall`)),
              ]);
            } catch (e) {}
            return;
          }

          if (callStateRef.current === "idle") {
            activeCallPathRef.current = pathKey;
            setCallState("incoming");
            setCallType(val.type || "audio");
            incomingStartTimeRef.current = callStart;
            setCallerInfo({
              uid: val.from,
              name: val.fromName || "Friend",
              offer: val.offer,
              cfSessionId: val.cfSessionId,
              chatRoomId: val.chatRoomId || roomId || (val.from ? generateChatRoomId(val.from, currentUser.uid) : undefined),
              timestamp: callStart,
            });
            startRingtone();

            // Auto-decline if receiver doesn't accept call after 1 min (60 seconds)
            const remainingTime = Math.max(5000, 60000 - Math.max(0, callAge));
            if (autoDeclineTimerRef.current) clearTimeout(autoDeclineTimerRef.current);
            autoDeclineTimerRef.current = setTimeout(() => {
              if (callStateRef.current === "incoming") {
                // Auto-decline timed out silently
                void declineCall(true);
              }
            }, remainingTime);
          }
        }
      };

      const checkCallEnded = (pathKey: string, val: any) => {
        if (activeCallPathRef.current === pathKey) {
          if (!val || val.status === "ended" || val.status === "cancelled" || val.status === "declined") {
            activeCallPathRef.current = null;
            if (autoDeclineTimerRef.current) {
              clearTimeout(autoDeclineTimerRef.current);
              autoDeclineTimerRef.current = null;
            }
            endCallCleanup();
          }
        }
      };

      // 1. User node direct listener (users/$uid/incomingCall)
      const incomingCallRef = runtime.dbFns.ref(runtime.db, `users/${currentUser.uid}/incomingCall`);
      unsubIncomingCall = runtime.dbFns.onValue(incomingCallRef, (snapshot: any) => {
        const val = snapshot.val();
        if (val) {
          processIncomingCall(val, "users_incomingCall");
        } else {
          checkCallEnded("users_incomingCall", val);
        }
      });

      // 2. Direct User Call listener (userCalls/$uid)
      const userCallRef = runtime.dbFns.ref(runtime.db, `userCalls/${currentUser.uid}`);
      unsubUserCall = runtime.dbFns.onValue(userCallRef, (snapshot: any) => {
        const val = snapshot.val();
        if (val) {
          processIncomingCall(val, "userCalls");
        } else {
          checkCallEnded("userCalls", val);
        }
      });

      // 3. Direct Call listener (calls/$uid)
      const callRef = runtime.dbFns.ref(runtime.db, `calls/${currentUser.uid}`);
      unsubCall = runtime.dbFns.onValue(callRef, (snapshot: any) => {
        const val = snapshot.val();
        if (val) {
          processIncomingCall(val, "calls");
        } else {
          checkCallEnded("calls", val);
        }
      });

      // Listen to each known conversation directly. Reading /chats as a whole
      // is usually denied by Firebase rules even when an individual room is allowed.
      const roomUnsubscribers = new Map<string, () => void>();
      const usersRef = runtime.dbFns.ref(runtime.db, "users");
      const unsubscribeUsers = runtime.dbFns.onValue(usersRef, (snapshot: any) => {
        const users = snapshot.val() || {};
        Object.keys(users).forEach((otherUid) => {
          if (otherUid === currentUser.uid || roomUnsubscribers.has(otherUid)) return;
          const roomId = generateChatRoomId(currentUser.uid, otherUid);
          const roomCallRef = runtime.dbFns.ref(runtime.db, `chats/${roomId}/call`);
          const unsubscribeRoom = runtime.dbFns.onValue(roomCallRef, (callSnapshot: any) => {
            const value = callSnapshot.val();
            if (value) {
              void processIncomingCall(value, `chat:${roomId}`, roomId).catch((error) => console.warn("Incoming room call error:", error));
            } else {
              checkCallEnded(`chat:${roomId}`, null);
            }
          }, (error: any) => console.warn("Room call listener warning:", error));
          roomUnsubscribers.set(otherUid, unsubscribeRoom);
        });
      }, (error: any) => console.warn("Users listener warning:", error));
      unsubChats = () => {
        unsubscribeUsers();
        roomUnsubscribers.forEach((unsubscribe) => unsubscribe());
        roomUnsubscribers.clear();
      };
    });

    return () => {
      if (typeof unsubIncomingCall === "function") unsubIncomingCall();
      if (typeof unsubUserCall === "function") unsubUserCall();
      if (typeof unsubCall === "function") unsubCall();
      if (typeof unsubChats === "function") unsubChats();
    };
  }, [currentUser?.uid]);

  const acceptCall = async () => {
    if (autoDeclineTimerRef.current) {
      clearTimeout(autoDeclineTimerRef.current);
      autoDeclineTimerRef.current = null;
    }
    stopRingtone();
    if (!callerInfo?.uid || !callerInfo?.offer) {
      toast.error("Invalid call offer");
      endCall();
      return;
    }

    setCallState("active");
    let stream: MediaStream | null = null;

    try {
      if (navigator.mediaDevices && navigator.mediaDevices.getUserMedia) {
        stream = await navigator.mediaDevices.getUserMedia({
          audio: { echoCancellation: true, noiseSuppression: true, autoGainControl: true },
          video: callType === "video",
        });
      }
    } catch (err) {
      if (callType === "video") {
        try {
          stream = await navigator.mediaDevices.getUserMedia({
            audio: { echoCancellation: true, noiseSuppression: true, autoGainControl: true },
          });
          setCallType("audio");
          toast.info("Connecting as Voice Call (Camera unavailable)");
        } catch (audioErr) {
          toast.error("Microphone access blocked. Please enable mic permission in browser site settings.");
          endCall();
          return;
        }
      } else {
        toast.error("Microphone access blocked. Please enable mic permission in browser site settings.");
        endCall();
        return;
      }
    }

    if (!stream) {
      toast.error("Microphone or camera permission required for calls");
      endCall();
      return;
    }

    localStreamRef.current = stream;
    if (localVideoRef.current && (stream.getVideoTracks()?.length || 0) > 0) {
      localVideoRef.current.srcObject = stream;
    }

    const pc = new RTCPeerConnection(ICE_SERVERS);
    pcRef.current = pc;

    if (stream) {
      stream.getTracks().forEach((track) => pc.addTrack(track, stream!));
    }

    pc.ontrack = (event) => {
      console.log("GlobalCallManager ontrack:", event.track.kind, event.streams);
      let remoteStream = event.streams && event.streams[0];
      if (!remoteStream) {
        remoteStream = new MediaStream();
        remoteStream.addTrack(event.track);
      }

      if (event.track.kind === "audio" || (remoteStream.getAudioTracks()?.length || 0) > 0) {
        if (remoteAudioRef.current) {
          remoteAudioRef.current.srcObject = remoteStream;
          remoteAudioRef.current.muted = false;
          remoteAudioRef.current.volume = isLoudSpeaker ? 1.0 : 0.25;
          remoteAudioRef.current.play().catch((err) => console.warn("remoteAudio play warning:", err));
        }
      }

      if (event.track.kind === "video" || (remoteStream.getVideoTracks()?.length || 0) > 0) {
        if (remoteVideoRef.current) {
          remoteVideoRef.current.srcObject = remoteStream;
          remoteVideoRef.current.muted = false;
          remoteVideoRef.current.play().catch((err) => console.warn("remoteVideo play warning:", err));
        }
      }
    };

    const runtime = await loadFirebase();
    if (!runtime) return;

    const chatRoomId = callerInfo.chatRoomId || generateChatRoomId(callerInfo.uid, currentUser.uid);

    pc.onicecandidate = (event) => {
      if (event.candidate) {
        const candObj = JSON.parse(JSON.stringify(event.candidate));
        runtime.dbFns.push(runtime.dbFns.ref(runtime.db, `chats/${chatRoomId}/call/receiverCandidates`), candObj).catch(() => {});
        runtime.dbFns.push(runtime.dbFns.ref(runtime.db, `userCalls/${callerInfo.uid}/receiverCandidates`), candObj).catch(() => {});
        runtime.dbFns.push(runtime.dbFns.ref(runtime.db, `calls/${callerInfo.uid}/receiverCandidates`), candObj).catch(() => {});
        runtime.dbFns.push(runtime.dbFns.ref(runtime.db, `users/${callerInfo.uid}/receiverCandidates`), candObj).catch(() => {});
      }
    };

    try {
      await pc.setRemoteDescription(new RTCSessionDescription(callerInfo.offer));
      const answer = await pc.createAnswer({
        offerToReceiveAudio: true,
        offerToReceiveVideo: true,
      });
      await pc.setLocalDescription(answer);

      createCloudflareCallSession(answer).then((cfRes) => {
        if (cfRes?.sessionId) {
          console.log("Receiver Cloudflare Calls SFU Session initialized:", cfRes.sessionId);
        }
      }).catch(console.warn);

      const answerData = {
        type: String(answer.type),
        sdp: String(answer.sdp),
      };

      await Promise.all([
        runtime.dbFns.set(runtime.dbFns.ref(runtime.db, `chats/${chatRoomId}/call/answer`), answerData).catch(() => {}),
        runtime.dbFns.set(runtime.dbFns.ref(runtime.db, `userCalls/${callerInfo.uid}/answer`), answerData).catch(() => {}),
        runtime.dbFns.set(runtime.dbFns.ref(runtime.db, `calls/${callerInfo.uid}/answer`), answerData).catch(() => {}),
        runtime.dbFns.set(runtime.dbFns.ref(runtime.db, `users/${callerInfo.uid}/callAnswer`), answerData).catch(() => {}),
        runtime.dbFns.update(runtime.dbFns.ref(runtime.db, `chats/${chatRoomId}/call`), { status: "accepted" }).catch(() => {}),
        runtime.dbFns.update(runtime.dbFns.ref(runtime.db, `userCalls/${currentUser.uid}`), { status: "accepted" }).catch(() => {}),
        runtime.dbFns.update(runtime.dbFns.ref(runtime.db, `calls/${currentUser.uid}`), { status: "accepted" }).catch(() => {}),
        runtime.dbFns.update(runtime.dbFns.ref(runtime.db, `users/${currentUser.uid}/incomingCall`), { status: "accepted" }).catch(() => {}),
      ]);

      // Listen for caller ICE candidates from all paths
      const listenCandidates = (path: string) => {
        const candRef = runtime.dbFns.ref(runtime.db, path);
        runtime.dbFns.onChildAdded(candRef, (snapshot: any) => {
          const candidateData = snapshot.val();
          if (candidateData && pcRef.current) {
            pcRef.current.addIceCandidate(new RTCIceCandidate(candidateData)).catch(console.warn);
          }
        });
      };

      listenCandidates(`chats/${chatRoomId}/call/callerCandidates`);
      listenCandidates(`userCalls/${currentUser.uid}/callerCandidates`);
      listenCandidates(`calls/${currentUser.uid}/callerCandidates`);
      listenCandidates(`users/${currentUser.uid}/callerCandidates`);

      // Call connected silently
    } catch (e) {
      console.error("acceptCall WebRTC error:", e);
      toast.error("WebRTC Connection failed");
      endCall();
    }
  };

  const declineCall = async (isTimeout = false) => {
    if (autoDeclineTimerRef.current) {
      clearTimeout(autoDeclineTimerRef.current);
      autoDeclineTimerRef.current = null;
    }
    const declinedCaller = callerInfo;
    if (declinedCaller?.uid) {
      const ringDuration = incomingStartTimeRef.current
        ? Math.max(1, Math.round((Date.now() - incomingStartTimeRef.current) / 1000))
        : 60;
      const status = isTimeout ? "missed" : "declined";
      logCallHistory(
        declinedCaller.uid,
        currentUser.uid,
        callType,
        status,
        ringDuration,
        incomingStartTimeRef.current || Date.now()
      ).catch(() => {});
    }
    endCallCleanup();
    if (declinedCaller?.uid) {
      const callIdKey = `${declinedCaller.uid}_${declinedCaller.timestamp || 0}`;
      recentlyDeclinedCalls.current.add(callIdKey);
      setTimeout(() => recentlyDeclinedCalls.current.delete(callIdKey), 15000);
    }
    try {
      const runtime = await loadFirebase();
      if (!runtime || !currentUser?.uid || !declinedCaller?.uid) return;
      const roomId = declinedCaller.chatRoomId || generateChatRoomId(declinedCaller.uid, currentUser.uid);
      const declineData = { status: "declined", endedAt: Date.now() };
      await Promise.all([
        runtime.dbFns.update(runtime.dbFns.ref(runtime.db, `chats/${roomId}/call`), declineData).catch(() => {}),
        runtime.dbFns.update(runtime.dbFns.ref(runtime.db, `calls/${currentUser.uid}`), declineData).catch(() => {}),
        runtime.dbFns.update(runtime.dbFns.ref(runtime.db, `userCalls/${currentUser.uid}`), declineData).catch(() => {}),
        runtime.dbFns.update(runtime.dbFns.ref(runtime.db, `users/${currentUser.uid}/incomingCall`), declineData).catch(() => {}),
        runtime.dbFns.update(runtime.dbFns.ref(runtime.db, `calls/${declinedCaller.uid}`), declineData).catch(() => {}),
      ]);
      // Clean up incoming nodes after brief delay so caller has time to receive the decline status
      setTimeout(() => {
        Promise.all([
          runtime.dbFns.remove(runtime.dbFns.ref(runtime.db, `users/${currentUser.uid}/incomingCall`)).catch(() => {}),
          runtime.dbFns.remove(runtime.dbFns.ref(runtime.db, `userCalls/${currentUser.uid}`)).catch(() => {}),
          runtime.dbFns.remove(runtime.dbFns.ref(runtime.db, `calls/${currentUser.uid}`)).catch(() => {}),
        ]).catch(() => {});
      }, 2000);
    } catch (error) {
      console.warn("Decline call update failed:", error);
    }
  };
  const endCall = async () => {
    if (autoDeclineTimerRef.current) {
      clearTimeout(autoDeclineTimerRef.current);
      autoDeclineTimerRef.current = null;
    }
    if (callerInfo?.uid && callState === "active") {
      logCallHistory(
        callerInfo.uid,
        currentUser.uid,
        callType,
        "completed",
        callDuration,
        incomingStartTimeRef.current || Date.now()
      ).catch(() => {});
    }
    endCallCleanup();
    try {
      if (currentUser?.uid) {
        const runtime = await loadFirebase();
        if (runtime) {
          const paths = [
            `userCalls/${currentUser.uid}`,
            `calls/${currentUser.uid}`,
            `users/${currentUser.uid}/incomingCall`,
            `users/${currentUser.uid}/callAnswer`,
            `users/${currentUser.uid}/callerCandidates`,
            `users/${currentUser.uid}/receiverCandidates`,
          ];
          if (callerInfo?.uid) {
            const roomId = callerInfo.chatRoomId || generateChatRoomId(callerInfo.uid, currentUser.uid);
            paths.push(`chats/${roomId}/call`);
            paths.push(`userCalls/${callerInfo.uid}`);
            paths.push(`calls/${callerInfo.uid}`);
            paths.push(`users/${callerInfo.uid}/incomingCall`);
            paths.push(`users/${callerInfo.uid}/callAnswer`);
            paths.push(`users/${callerInfo.uid}/callerCandidates`);
            paths.push(`users/${callerInfo.uid}/receiverCandidates`);
          }
          await Promise.all(paths.map((p) => runtime.dbFns.remove(runtime.dbFns.ref(runtime.db, p)).catch(() => {})));
        }
      }
    } catch (e) {
      console.error("Global endCall error:", e);
    }
  };

  const endCallCleanup = () => {
    if (autoDeclineTimerRef.current) {
      clearTimeout(autoDeclineTimerRef.current);
      autoDeclineTimerRef.current = null;
    }
    stopRingtone();
    if (localStreamRef.current) {
      localStreamRef.current.getTracks().forEach((t) => t.stop());
      localStreamRef.current = null;
    }
    if (pcRef.current) {
      pcRef.current.close();
      pcRef.current = null;
    }
    setCallState("idle");
    setCallerInfo(null);
  };

  const toggleMic = () => {
    if (localStreamRef.current) {
      const track = localStreamRef.current.getAudioTracks()[0];
      if (track) {
        track.enabled = !track.enabled;
        setIsMicMuted(!track.enabled);
      }
    }
  };

  const toggleVideo = () => {
    if (localStreamRef.current) {
      const track = localStreamRef.current.getVideoTracks()[0];
      if (track) {
        track.enabled = !track.enabled;
        setIsVideoDisabled(!track.enabled);
      }
    }
  };

  if (callState === "idle") return null;

  return (
    <div className="fixed inset-0 bg-gradient-to-b from-rose-950/60 via-slate-950 to-slate-950 backdrop-blur-xl z-[9999] flex flex-col items-center justify-between p-6 select-none animate-in fade-in zoom-in-95 duration-300">
      {/* Invisible Audio Element for HD Voice Streams */}
      <audio ref={remoteAudioRef} autoPlay playsInline className="hidden" />

      {/* Top Header & Caller Branding */}
      <div className="flex flex-col items-center gap-4 mt-12 w-full max-w-sm">
        {/* Pulsing Avatar Container */}
        <div className="relative">
          {callState === "incoming" && (
            <>
              <div className="absolute -inset-4 rounded-full bg-rose-500/20 animate-ping" />
              <div className="absolute -inset-8 rounded-full bg-emerald-500/10 animate-pulse" />
            </>
          )}
          <Avatar className="w-28 h-28 border-4 border-white/20 shadow-[0_0_60px_rgba(244,63,94,0.3)] relative z-10">
            <AvatarFallback className="bg-gradient-to-br from-rose-500 to-pink-600 text-white text-4xl font-extrabold">
              {String(callerInfo?.name || "U").charAt(0).toUpperCase()}
            </AvatarFallback>
          </Avatar>
        </div>

        <div className="text-center space-y-1 z-10">
          <h2 className="text-3xl font-extrabold text-white tracking-tight">
            {callerInfo?.name || "Incoming Call"}
          </h2>
          <div className="flex items-center justify-center gap-2">
            <span className="inline-flex items-center gap-1.5 px-3.5 py-1 rounded-full bg-white/10 backdrop-blur-md text-xs font-semibold text-rose-300 border border-white/10 shadow-lg">
              {callType === "video" ? <Video className="w-3.5 h-3.5 text-rose-400" /> : <Phone className="w-3.5 h-3.5 text-rose-400" />}
              {callState === "incoming" && `Incoming ${callType === "video" ? "Video" : "Voice"} Call`}
              {callState === "calling" && `Ringing...`}
              {callState === "active" && `HD Call • ${formatDuration(callDuration)}`}
            </span>
          </div>
        </div>
      </div>

      {/* Video Call Streams */}
      {callType === "video" && (callState === "calling" || callState === "active") && (
        <div className="relative w-full max-w-lg h-72 bg-slate-900/90 rounded-3xl overflow-hidden border border-white/10 shadow-2xl my-4">
          <video ref={remoteVideoRef} autoPlay playsInline className="w-full h-full object-cover" />
          <div className="absolute bottom-3 right-3 w-32 h-24 bg-slate-950/90 rounded-2xl overflow-hidden border border-white/20 shadow-xl">
            <video ref={localVideoRef} autoPlay muted playsInline className="w-full h-full object-cover" />
          </div>
        </div>
      )}

      {/* Bottom Action Controls */}
      <div className="flex items-center gap-8 mb-12 z-10">
        {callState === "incoming" ? (
          <>
            {/* Desktop / Laptop: Direct Tap Controls */}
            <div className="hidden md:flex items-center gap-8">
              <div className="flex flex-col items-center gap-2">
                <Button
                  onClick={() => declineCall(false)}
                  className="w-20 h-20 rounded-full bg-rose-600 hover:bg-rose-700 text-white shadow-[0_0_35px_rgba(225,29,72,0.6)] flex items-center justify-center transition-transform active:scale-95 cursor-pointer"
                >
                  <PhoneOff className="w-8 h-8" />
                </Button>
                <span className="text-xs font-semibold text-rose-300/80">Decline</span>
              </div>

              <div className="flex flex-col items-center gap-2">
                <Button
                  onClick={acceptCall}
                  className="w-20 h-20 rounded-full bg-emerald-500 hover:bg-emerald-600 text-white shadow-[0_0_35px_rgba(16,185,129,0.7)] flex items-center justify-center animate-bounce transition-transform active:scale-95 cursor-pointer"
                >
                  {callType === "video" ? <Video className="w-8 h-8" /> : <Phone className="w-8 h-8" />}
                </Button>
                <span className="text-xs font-semibold text-emerald-300/80">Accept</span>
              </div>
            </div>

            {/* Mobile / Phone: Slide Up to Answer */}
            <div className="flex md:hidden items-end gap-12">
              <div className="flex flex-col items-center gap-2 pb-2">
                <Button
                  onClick={() => declineCall(false)}
                  className="w-16 h-16 rounded-full bg-rose-600 hover:bg-rose-700 text-white shadow-[0_0_30px_rgba(225,29,72,0.6)] flex items-center justify-center transition-transform active:scale-95 cursor-pointer"
                >
                  <PhoneOff className="w-7 h-7" />
                </Button>
                <span className="text-xs font-semibold text-rose-300/80">Decline</span>
              </div>

              <div className="flex flex-col items-center">
                <SlideUpAccept onAccept={acceptCall} callType={callType} />
                <span className="text-xs font-semibold text-emerald-300/80 mt-2">Slide to Answer</span>
              </div>
            </div>
          </>
        ) : (
          <>
            <div className="flex flex-col items-center gap-2">
              <Button
                onClick={toggleMic}
                variant="ghost"
                className={`w-16 h-16 rounded-full transition-transform active:scale-95 ${
                  isMicMuted ? "bg-rose-600 text-white shadow-lg shadow-rose-600/30" : "bg-white/10 hover:bg-white/20 text-white backdrop-blur-md"
                }`}
              >
                {isMicMuted ? <MicOff className="w-7 h-7" /> : <Mic className="w-7 h-7" />}
              </Button>
              <span className="text-xs font-semibold text-slate-400">{isMicMuted ? "Unmute" : "Mute"}</span>
            </div>

            {callType === "video" && (
              <div className="flex flex-col items-center gap-2">
                <Button
                  onClick={toggleVideo}
                  variant="ghost"
                  className={`w-16 h-16 rounded-full transition-transform active:scale-95 ${
                    isVideoDisabled ? "bg-rose-600 text-white shadow-lg shadow-rose-600/30" : "bg-white/10 hover:bg-white/20 text-white backdrop-blur-md"
                  }`}
                >
                  {isVideoDisabled ? <VideoOff className="w-7 h-7" /> : <Video className="w-7 h-7" />}
                </Button>
                <span className="text-xs font-semibold text-slate-400">{isVideoDisabled ? "Start Cam" : "Stop Cam"}</span>
              </div>
            )}

            {/* Speaker button only shown when call is accepted! */}
            {callState === "active" && (
              <div className="flex flex-col items-center gap-2">
                <Button
                  onClick={toggleSpeaker}
                  variant="ghost"
                  className={`w-16 h-16 rounded-full transition-transform active:scale-95 ${
                    isLoudSpeaker ? "bg-emerald-600 text-white shadow-lg shadow-emerald-600/30" : "bg-white/10 hover:bg-white/20 text-white backdrop-blur-md"
                  }`}
                >
                  {isLoudSpeaker ? <Volume2 className="w-7 h-7" /> : <Volume1 className="w-7 h-7" />}
                </Button>
                <span className="text-xs font-semibold text-slate-400">{isLoudSpeaker ? "Loud" : "Low"}</span>
              </div>
            )}

            <div className="flex flex-col items-center gap-2">
              <Button
                onClick={endCall}
                className="w-20 h-20 rounded-full bg-rose-600 hover:bg-rose-700 text-white shadow-[0_0_35px_rgba(225,29,72,0.6)] flex items-center justify-center transition-transform active:scale-95 cursor-pointer"
              >
                <PhoneOff className="w-8 h-8" />
              </Button>
              <span className="text-xs font-semibold text-rose-300/80">End Call</span>
            </div>
          </>
        )}
      </div>
    </div>
  );
}
