"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { ChatView } from "@/components/chat/chat-view";
import { getPrefs } from "@/lib/store/prefs";

export default function ChatPage() {
  const router = useRouter();
  const [ready, setReady] = useState(false);
  const [fresh, setFresh] = useState(0);

  useEffect(() => {
    const p = getPrefs();
    if (!p.onboardingComplete) {
      router.replace("/onboarding");
      return;
    }
    // "?new=1" (from the New chat button) forces a fresh, empty ChatView.
    if (new URLSearchParams(window.location.search).get("new") === "1") {
      setFresh((n) => n + 1);
    }
    setReady(true);
  }, [router]);

  if (!ready) return null;
  return <ChatView key={`new-${fresh}`} conversationId={null} />;
}
