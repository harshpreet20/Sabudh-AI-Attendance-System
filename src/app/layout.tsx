import type { Metadata, Viewport } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import { Toaster } from "sonner";
import { PwaRegister } from "@/components/pwa/pwa-register";
import { PermissionsPopup } from "@/components/pwa/permissions-popup";
import { NotificationListener } from "@/components/pwa/notification-listener";
import "./globals.css";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: "Sabudh AI  - Post-Lecture Engagement Platform | Sabudh Foundation",
  description:
    "Sabudh Foundation's AI-powered post-lecture engagement platform  - attendance verification, discussions, assignments, projects, and certificate management for the GEN AI Course.",
  applicationName: "Sabudh AI",
  icons: {
    icon: "/sabudh-logo.png",
    apple: "/icons/apple-touch-icon.png",
  },
  appleWebApp: {
    capable: true,
    statusBarStyle: "default",
    title: "Sabudh AI",
  },
};

export const viewport: Viewport = {
  themeColor: "#4f46e5",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html
      lang="en"
      className={`${geistSans.variable} ${geistMono.variable} h-full antialiased`}
    >
      <body className="min-h-full flex flex-col text-foreground">
        {children}
        <Toaster position="top-right" richColors closeButton />
        <PwaRegister />
        <PermissionsPopup />
        <NotificationListener />
      </body>
    </html>
  );
}
