"use client";

"use client";

import { 
  Authenticated, 
  Unauthenticated,
  ConvexReactClient,
  AuthLoading, 
} from "convex/react";
import { ClerkProvider, useAuth } from "@clerk/nextjs";
import { ConvexProviderWithClerk } from "convex/react-clerk";

import { UnauthenticatedView } from "@/features/auth/components/unauthenticated-view";
import { AuthLoadingView } from "@/features/auth/components/auth-loading-view";

import { ThemeProvider } from "next-themes";
import { TooltipProvider } from "@/components/ui/tooltip";


const convex = new ConvexReactClient(process.env.NEXT_PUBLIC_CONVEX_URL!);

export const Providers = ({ children }: { children: React.ReactNode }) => {
  return (
    <ClerkProvider>
      <ConvexProviderWithClerk client={convex} useAuth={useAuth}>
        <ThemeProvider
          attribute="class"
          defaultTheme="dark"
          enableSystem
          disableTransitionOnChange
        >
          <TooltipProvider>
            <Authenticated>
              {children}
            </Authenticated>
            <Unauthenticated>
              <UnauthenticatedView />
            </Unauthenticated>
            <AuthLoading>
              <AuthLoadingView />
            </AuthLoading>
          </TooltipProvider>
        </ThemeProvider>
      </ConvexProviderWithClerk>
    </ClerkProvider>
  );
};
