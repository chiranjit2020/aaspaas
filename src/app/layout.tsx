import type { Metadata, Viewport } from "next";
import { Manrope, Playfair_Display } from "next/font/google";
import { SiteHeader } from "@/components/layout/site-header";
import { SiteFooter } from "@/components/layout/site-footer";
import { OnboardingTour } from "@/components/onboarding/onboarding-tour";
import "./globals.css";

// Brand typography: Manrope for body/UI, Playfair Display for headings.
const manrope = Manrope({
  variable: "--font-manrope",
  subsets: ["latin"],
});

const playfairDisplay = Playfair_Display({
  variable: "--font-playfair-display",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: "AasPaas — Discover what's around you",
  description:
    "A community-powered directory of local shops, services and places — added, verified and corrected by the people who actually use them.",
};

export const viewport: Viewport = {
  colorScheme: "dark",
  themeColor: "#000000",
};

// Dark is the default (and, until a theme switcher exists, only) theme.
export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html
      lang="en"
      className={`dark ${manrope.variable} ${playfairDisplay.variable} h-full antialiased`}
    >
      <body className="flex min-h-full flex-col">
        <SiteHeader />
        <main className="flex-1">{children}</main>
        <SiteFooter />
        <OnboardingTour />
      </body>
    </html>
  );
}
