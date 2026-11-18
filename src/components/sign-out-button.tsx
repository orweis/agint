"use client";

import { useRouter } from "next/navigation";
import { useTransition } from "react";

import { authClient } from "@/lib/auth-client";
import { routes } from "@/lib/routes";

import { Button } from "./ui/button";

export function SignOutButton() {
  const router = useRouter();
  const [pending, start] = useTransition();
  return (
    <Button
      variant="ghost"
      size="sm"
      pending={pending}
      onClick={() =>
        start(async () => {
          await authClient.signOut();
          router.push(routes.home());
          router.refresh();
        })
      }
    >
      Sign out
    </Button>
  );
}
