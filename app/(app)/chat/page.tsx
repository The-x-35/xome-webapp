"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { ChatView } from "@/components/chat/chat-view";
import { getPrefs } from "@/lib/store/prefs";

export default function ChatPage() {
  const router = useRouter();
  const [ready, setReady] = useState(false);

  useEffect(() => {
    if (!getPrefs().onboardingComplete) {
      router.replace("/onboarding");
      return;
    }
    setReady(true);
  }, [router]);

  if (!ready) return null;
  return <ChatView conversationId={null} />;
}
